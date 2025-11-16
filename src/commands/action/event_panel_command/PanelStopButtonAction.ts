import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ComponentType,
  DiscordAPIError,
  EmbedBuilder,
  GuildScheduledEvent,
  GuildScheduledEventStatus,
  Message,
  RepliableInteraction,
} from 'discord.js';
import eventManager, { EventWithHost } from '../../../event/EventManager.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import { config } from '../../../utils/config.js';
import { logger } from '../../../utils/log.js';
import { onEndEvent } from '../../../event_handler.js';
import { checkEventOperationPermission } from '../../../utils/permissions/checkCommandPermission.js';
import { messageUpdateManager } from '../../../utils/client.js';
import eventInfoMessageUpdater from '../../../message_updaters/EventInfoMessageUpdater.js';
import { syncRoleByCondition } from '../../../event/roleManager.js';
import messageEditor from '../../../utils/discord/MessageEditor.js';
import { client } from '../../../utils/client.js';
import { prisma } from '../../../utils/prisma.js';
import { makeGameResultEmbed } from '../../../event/game.js';
import { Event, GameResult } from '@prisma/client';
import panelStopConfirmModalAction from './PanelStopConfirmModalAction.js';
import { ThreadChannel } from 'discord.js';

class PanelStopButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  /**
   * ボタンを作成
   * @param eventId イベントID
   * @returns 作成したビルダー
   */
  override create(eventId: number): ButtonBuilder {
    // カスタムIDを生成
    const customId = this.createCustomId({
      evt: `${eventId}`,
    });

    // ダイアログを作成
    return new ButtonBuilder()
      .setCustomId(customId)
      .setEmoji('⏹️')
      .setLabel('③イベント終了')
      .setStyle(ButtonStyle.Danger);
  }

  /**
   * イベントスレッドを更新（試合結果を投稿）
   * @param thread スレッド
   * @param event イベント
   */
  private async _updateEventThread(
    thread: ThreadChannel,
    event: Event,
  ): Promise<void> {
    try {
      // 試合結果
      const gameResults = await prisma.gameResult.findMany({
        where: {
          eventId: event.id,
        },
        include: {
          users: true,
        },
      });

      // ゲームの戦績をすべて表示
      const gameResultMessages: { game: GameResult; message: Message }[] = [];
      for (const game of gameResults) {
        const embeds = await makeGameResultEmbed(game.id);
        const gameResultMessage = await thread.send({ embeds: [embeds] });
        gameResultMessages.push({ game, message: gameResultMessage });
      }

      if (gameResultMessages.length === 0) return;

      const fetched = await thread.messages.fetch({ limit: 2, after: '0' });
      const lastMessage = fetched.first();

      // イベントの思い出を記録しておきましょう！というBOTのメッセージが取得できた場合、そのメッセージに戦績を記録する
      if (
        lastMessage &&
        lastMessage.author.id === client.user?.id &&
        lastMessage.content.includes('イベントの思い出を記録しておきましょう！')
      ) {
        // Embedを作成
        const embed = new EmbedBuilder()
          .setTitle(`${event.name} の試合結果一覧`)
          .setDescription(
            gameResultMessages
              .map(
                ({ game, message }) =>
                  `[${game.name} (試合ID: ${game.id})](${message.url})`,
              )
              .join('\n'),
          )
          .setColor('#ff8c00');

        // 最初のメッセージにリンクを追加
        await messageEditor.editMessage(lastMessage, {
          embeds: [embed],
        });
      }
    } catch (error) {
      logger.error(`スレッド更新中にエラーが発生しました: ${String(error)}`);
    }
  }

  /**
   * イベントを停止する
   * @param interaction インタラクション
   * @param event イベント
   * @param scheduledEvent Discordイベント
   * @param panelMessageId パネルメッセージID（オプション）
   * @returns 停止したイベント
   */
  async stopEvent(
    interaction: RepliableInteraction,
    event: EventWithHost,
    scheduledEvent: GuildScheduledEvent,
    panelMessageId?: string,
  ): Promise<void> {
    // アナウンスチャンネルを取得
    const announcementChannel = interaction.guild?.channels.cache.get(
      config.announcement_channel_id,
    );
    if (!announcementChannel || !announcementChannel.isTextBased()) {
      await interaction.editReply({
        content: 'アナウンスチャンネルが見つかりませんでした',
      });
      return;
    }

    // ログに残す
    logger.info(
      `${interaction.user.username} がイベント終了ボタンを押してイベント「${event.name}」(ID: ${event.id})を終了しました`,
    );

    // Discordイベントを終了
    await scheduledEvent
      .edit({
        status: GuildScheduledEventStatus.Completed,
      })
      .catch((_) => {});

    // イベントがまだアクティブなら、イベントを終了する (Discordイベントが終了していない場合などのフォールバック)
    const eventAfterStop = await eventManager.getEventFromId(event.id);
    if (
      scheduledEvent.channel?.isVoiceBased() &&
      eventAfterStop?.active === (GuildScheduledEventStatus.Active as number)
    ) {
      await onEndEvent(eventAfterStop, scheduledEvent.channel);
    }

    // イベントに関連する全メッセージの更新をスケジュール
    messageUpdateManager.enqueue(event.id);
    logger.info(`イベント ${event.id} の関連メッセージ更新をスケジュール`);

    // アナウンスチャンネルのスレッド処理
    if (
      announcementChannel.type === ChannelType.GuildAnnouncement ||
      announcementChannel.type === ChannelType.GuildText
    ) {
      const threads = await announcementChannel.threads.fetchActive();
      for (const [, thread] of threads.threads) {
        // スレッドのスターターメッセージを取得
        const startMessage = await thread
          .fetchStarterMessage()
          .catch(() => undefined);

        if (!startMessage) continue;

        // イベント情報メッセージかどうかチェック
        if (eventInfoMessageUpdater.canParseMessage(startMessage)) {
          try {
            const messageEventId =
              await eventInfoMessageUpdater.parseEventIdFromMessage(
                startMessage,
              );
            if (messageEventId === event.id) {
              // このスレッドは対象イベントのもの → スレッド固有の処理を実行
              await this._updateEventThread(thread, event);
            }
          } catch (_) {
            // パースに失敗した場合は無視
          }
        }
      }
    }

    // ロールを同期 (非同期で実行)
    if (interaction.guild) {
      void syncRoleByCondition(interaction.guild);
    }

    // パネルのメッセージ削除
    let panelMessage: Message | undefined;
    try {
      if (panelMessageId && interaction.channel) {
        // メッセージIDが渡された場合はそれを使用
        panelMessage = await messageEditor.fetchMessage(
          panelMessageId,
          interaction.channel,
        );
      } else if (interaction.isMessageComponent()) {
        // 従来の方法（後方互換性のため）
        panelMessage = await interaction.message
          .fetchReference()
          .catch(() => undefined);
      }
      await panelMessage?.delete();
    } catch (e) {
      // 権限エラーの場合警告を出す
      if (e instanceof DiscordAPIError && e.code === 50013) {
        logger.warn(
          'パネルのメッセージ削除に失敗しました: 権限がありません。「メッセージの管理」権限の他に、「チャンネルを見る」権限も必要です。',
        );
      } else {
        logger.error('パネルのメッセージ削除に失敗しました', e);
      }
    }

    await interaction.editReply({
      content: `イベント「${event.name}」(ID: ${event.id})を終了しました。主催お疲れ様でした！`,
    });
  }

  /** @inheritdoc */
  async onCommand(
    interaction: ButtonInteraction,
    params: URLSearchParams,
  ): Promise<void> {
    const eventId = params.get('evt');
    if (!eventId) return; // 必要なパラメータがない場合は旧形式の可能性があるため無視

    // パネルメッセージIDを取得
    const panelMessageId = interaction.message.id;

    // モーダルのためdeferReplyを使わない
    // await interaction.deferReply({ ephemeral: true });

    // イベントを取得
    const event = await eventManager.getEventFromId(
      eventId ? parseInt(eventId) : undefined,
    );
    const scheduledEvent = await eventManager.getScheduleEvent(
      interaction,
      event,
    );
    if (!event || !scheduledEvent) {
      await interaction.reply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // 開始されているイベントのみ停止可能
    if (event.active !== (GuildScheduledEventStatus.Active as number)) {
      await interaction.reply({
        content: '開始されていないイベントは停止できません',
      });
      return;
    }

    // 権限をチェック
    const { member, hasPermission } = await checkEventOperationPermission(
      interaction,
      event.host?.userId,
    );
    if (!member || !hasPermission) {
      await interaction.reply({
        content: 'イベント主催者のみがイベントを停止できます',
      });
      return;
    }

    // モーダルを表示（パネルメッセージIDを含める）
    const stats = await panelStopConfirmModalAction.listupStats(event.id);
    await interaction.showModal(
      panelStopConfirmModalAction.create(event.id, stats, panelMessageId),
    );
  }
}

export default new PanelStopButtonAction('pstop', ComponentType.Button);
