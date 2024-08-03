import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
  GuildScheduledEventStatus,
} from 'discord.js';
import eventManager from '../../../event/EventManager.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import { config } from '../../../utils/config.js';
import { logger } from '../../../utils/log.js';
import { onEndEvent } from '../../../event_handler.js';
import getWebhook from '../../../event/getWebhook.js';
import { checkCommandPermission } from '../../../event/checkCommandPermission.js';
import eventAdminUpdateMessageCommand from '../../event_admin_command/EventAdminUpdateMessageCommand.js';
import { syncRoleByCondition } from '../../../event/roleManager.js';

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

  /** @inheritdoc */
  async onCommand(
    interaction: ButtonInteraction,
    params: URLSearchParams,
  ): Promise<void> {
    const eventId = params.get('evt');
    if (!eventId) return; // 必要なパラメータがない場合は旧形式の可能性があるため無視

    await interaction.deferReply({ ephemeral: true });

    // イベントを取得
    const event = await eventManager.getEventFromId(
      eventId ? parseInt(eventId) : undefined,
    );
    const scheduledEvent = await eventManager.getScheduleEvent(
      interaction,
      event,
    );
    if (!event || !scheduledEvent) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // 開始されているイベントのみ停止可能
    if (event.active !== (GuildScheduledEventStatus.Active as number)) {
      await interaction.editReply({
        content: '開始されていないイベントは停止できません',
      });
      return;
    }

    // メンバー情報を取得
    const member = await interaction.guild?.members.fetch(interaction.user.id);
    if (!interaction.guild || !member) {
      await interaction.editReply({
        content: 'メンバー情報の取得に失敗しました',
      });
      return;
    }

    // 権限をチェック
    if (
      // イベントの主催者か
      event.hostId !== interaction.user.id &&
      // /event_admin で権限を持っているか
      !(await checkCommandPermission('event_admin', member))
    ) {
      await interaction.editReply({
        content: 'イベント主催者のみがイベントを停止できます',
      });
      return;
    }

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
    if (scheduledEvent.channel?.isVoiceBased() && event.active) {
      await onEndEvent(event, scheduledEvent.channel);
    }

    // Webhookを取得
    const webhook = await getWebhook(interaction, announcementChannel);
    if (!webhook) {
      await interaction.editReply({
        content: 'Webhookの取得に失敗しました',
      });
      return;
    }

    // アナウンスチャンネルの最新3件のメッセージを取得
    const messages = await announcementChannel.messages.fetch({ limit: 3 });
    // Webhook経由でメッセージを取得し直す (MessageContent Intentsがないときは自身のメッセージしか取得できないため)
    const fetchedMessages = await Promise.all(
      messages
        .filter((m) => m.webhookId === webhook.webhook.id)
        .map((m) => webhook.webhook.fetchMessage(m.id)),
    );

    // イベントのメッセージを取得
    const message = fetchedMessages.find((m) => {
      try {
        // メッセージをパースしてイベントIDを取得
        const scheduledEventId =
          eventAdminUpdateMessageCommand.parseMessageEventId(m);
        return scheduledEventId === event.id;
      } catch (_) {
        return false;
      }
    });
    // イベントのメッセージが見つかった場合、メッセージを更新
    if (message) {
      try {
        await eventAdminUpdateMessageCommand.updateMessage(
          interaction,
          message,
        );
      } catch (error) {
        if (typeof error !== 'string') throw error;
        logger.error(`イベント終了中にエラーが発生しました: ${error}`);
      }
    }

    // パネルのメッセージ削除
    await interaction.message.delete().catch(() => {});

    // ロールを同期
    await syncRoleByCondition(interaction.guild);

    await interaction.editReply({
      content: `イベント「${event.name}」(ID: ${event.id})を終了しました。主催お疲れ様でした！`,
    });
  }
}

export default new PanelStopButtonAction('pstop', ComponentType.Button);
