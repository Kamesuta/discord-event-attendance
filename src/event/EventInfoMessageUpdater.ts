/**
 * イベント情報メッセージ用のMessageUpdater実装
 * イベント情報のEmbedメッセージの判定・更新・取得を担当
 */
import {
  ActionRowBuilder,
  BaseMessageOptions,
  ChannelType,
  EmbedBuilder,
  GuildScheduledEventStatus,
  Message,
  RepliableInteraction,
  StringSelectMenuBuilder,
  TextBasedChannel,
  ThreadAutoArchiveDuration,
} from 'discord.js';
import { EventWithHost } from './EventManager.js';
import { MessageUpdater, MessageUpdateContext } from './MessageUpdater.js';
import { config } from '../utils/config.js';
import { client } from '../utils/client.js';
import { prisma } from '../utils/prisma.js';
import splitStrings from './splitStrings.js';
import statusGameMenuAction from '../commands/action/StatusGameMenuAction.js';
import userManager from './UserManager.js';
import { gameResultInclude } from './game.js';
import { logger } from '../utils/log.js';
import { updateAttendanceTime } from './attendance_time.js';
import { getWebhookFromInteraction } from './getWebhook.js';
import messageEditor from './MessageEditor.js';

/**
 * イベント情報メッセージ用のMessageUpdater実装
 * イベント情報のEmbedメッセージの判定・更新・取得を担当
 */
class EventInfoMessageUpdater implements MessageUpdater {
  /**
   * イベント情報メッセージかどうかを判定
   * @param message Discordメッセージ
   * @returns 判定結果
   */
  canParseMessage(message: Message): boolean {
    // Embedが存在し、イベントURLが含まれているかチェック
    if (message.embeds.length === 0) return false;
    const embed = message.embeds[0];
    if (!embed.url) return false;
    // イベントURLの形式をチェック
    return /^https:\/\/discord\.com\/events\/\d+\/\d+$/.test(embed.url);
  }

  /**
   * イベント情報メッセージを更新
   * @param message Discordメッセージ
   * @param context 更新コンテキスト
   * @returns 更新されたメッセージ
   */
  async updateMessage(
    message: Message,
    context?: MessageUpdateContext,
  ): Promise<Message | undefined> {
    let eventId: number | null;

    // 強制指定されたイベントIDがある場合はそれを使用
    if (context?.forceEventId) {
      eventId = context.forceEventId;
    } else {
      // 通常の処理：メッセージからイベントIDを抽出
      eventId = await this.parseEventIdFromMessage(message);
    }

    if (!eventId) {
      throw new Error('このメッセージはイベント情報メッセージではありません');
    }

    // イベント情報を取得
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { host: true },
    });
    if (!event) {
      throw new Error('イベントが見つかりませんでした');
    }

    // メッセージ内容を抽出 (\n\n[～](https://discord.com/events/～) は削除)
    const messageMatch = message.content?.match(
      /^(.+)(?:\n\n\[(.+)\]\(https:\/\/discord\.com\/events\/.+\))?$/,
    );

    // イベント情報メッセージを生成
    const contents = await this.createEventMessage(
      event,
      messageMatch?.[1],
      messageMatch?.[2],
    );

    return await messageEditor.editMessage(message, contents);
  }

  /**
   * 関連するイベント情報メッセージを取得
   * @param event イベント
   * @returns 関連メッセージ配列
   */
  async getRelatedMessages(event: EventWithHost): Promise<Message[]> {
    const messages: Message[] = [];

    // 複数のチャンネルでイベント情報メッセージを検索
    const channelIds = [
      config.announcement_channel_id,
      config.schedule_channel_id,
      // 必要に応じて他のチャンネルIDを追加
    ].filter(Boolean);

    for (const channelId of channelIds) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) continue;

        const fetchedMessages = await channel.messages.fetch({ limit: 100 });
        for (const [, message] of fetchedMessages) {
          if (this.canParseMessage(message)) {
            const messageEventId = await this.parseEventIdFromMessage(message);
            if (messageEventId === event.id) {
              messages.push(message);
            }
          }
        }
      } catch (error) {
        console.error(
          `Failed to fetch messages from channel ${channelId}:`,
          error,
        );
      }
    }

    return messages;
  }

  /**
   * イベント情報のメッセージを生成
   * @param event イベント
   * @param message メッセージ
   * @param eventLinkMessage イベントリンクに表示するメッセージ
   * @param hasResult 参加者/戦績を表示するか
   * @returns 送信内容
   */
  async createEventMessage(
    event: EventWithHost,
    message?: string,
    eventLinkMessage?: string,
    hasResult = true,
  ): Promise<BaseMessageOptions> {
    // イベントの出欠状況を表示
    const stats = await prisma.userStat.findMany({
      where: {
        eventId: event.id,
        show: true,
      },
      include: {
        user: true,
      },
    });

    // ユーザーごとに参加回数をカウント
    const userCount = Object.fromEntries(
      await Promise.all(
        stats.map(async (stat) => {
          const count = await prisma.userStat.count({
            where: {
              userId: stat.userId,
              show: true,
              event: {
                // イベント終了前の参加回数をカウント
                startTime: {
                  lte:
                    event.endTime ??
                    event.startTime ??
                    event.scheduleTime ??
                    undefined,
                },
              },
            },
          });
          return [stat.userId, count] as const;
        }),
      ),
    );

    // イベントの時間を計算
    const duration =
      event.startTime && event.endTime
        ? ` (${Math.floor(
            (event.endTime.getTime() - event.startTime.getTime()) / 1000 / 60,
          )}分)`
        : '';

    const dateToMention = (date: Date | null): string | null =>
      date ? `<t:${Math.floor(date.getTime() / 1000)}:F>` : null;

    // スケジュール
    const schedule = event.startTime
      ? `${dateToMention(event.startTime)} 〜 ${
          dateToMention(event.endTime) ?? '未定'
        } ${duration}`
      : (dateToMention(event.scheduleTime) ?? '未定');

    // Embedを作成
    const embeds = new EmbedBuilder()
      .setTitle(
        event.endTime
          ? `🏁「${event.name}」イベントに参加してくれた人！`
          : `🏁「${event.name}」イベントの予定！`,
      )
      .setURL(`https://discord.com/events/${config.guild_id}/${event.eventId}`)
      .setDescription(event.description ? event.description : '説明なし')
      .setImage(event.coverImage)
      .setColor('#ff8c00')
      .addFields({
        name: '開催日時',
        value: schedule,
      });

    // 主催者を表示
    if (event.host) {
      embeds.setAuthor({
        name: `主催者: ${userManager.getUserName(event.host)}`,
        iconURL: userManager.getUserAvatar(event.host),
      });
    }

    // VCメッセージへのリンクを表示
    if (event.messageId) {
      embeds.addFields({
        name: 'イベント時のVCチャット履歴',
        value: `[クリックしてイベント時のVCの会話内容を見る](https://discord.com/channels/${config.guild_id}/${event.channelId}/${event.messageId})`,
      });
    }

    const footer: string[] = [];
    const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
    if (hasResult) {
      // ユーザーごとのXP合計を取得
      const userXp = (
        await Promise.all(
          stats.map(async (stat) => {
            const xp = await prisma.userGameResult.aggregate({
              where: {
                eventId: event.id,
                userId: stat.userId,
              },
              // eslint-disable-next-line @typescript-eslint/naming-convention
              _sum: {
                xp: true,
              },
            });
            return {
              stat,
              xp: xp._sum.xp ?? 0,
            };
          }),
        )
      )
        .filter(({ xp }) => xp > 0)
        .sort(({ xp: a }, { xp: b }) => b - a);

      // 試合結果
      const gameResults = await prisma.gameResult.findMany({
        where: {
          eventId: event.id,
        },
        ...gameResultInclude,
      });

      if (event.endTime) {
        // ゲームに参加したユーザーを表示
        const gameUsers = userXp.map(({ stat, xp }, i) => {
          const count = userCount[stat.userId];
          const memo = stat.memo ?? '';
          const countText = count === 1 ? '(🆕 初参加！)' : ` (${count}回目)`;
          return `${i + 1}位: <@${stat.user.userId}> (${xp}XP)${countText}${memo}`;
        });
        // ゲームに参加していないユーザーを表示
        const nonGameUsers = stats
          .filter(
            (stat) =>
              !userXp.some(({ stat: stat2 }) => stat2.userId === stat.userId),
          )
          .map((stat) => {
            const count = userCount[stat.userId];
            const memo = stat.memo ? ` ${stat.memo}` : '';
            const countText = count === 1 ? '(🆕 初参加！)' : ` (${count}回目)`;
            return `<@${stat.user.userId}> ${countText}${memo}`;
          });

        splitStrings([...gameUsers, ...nonGameUsers], 1024).forEach(
          (line, i) => {
            embeds.addFields({
              name:
                i === 0
                  ? `参加者 (${stats.length}人, 計${gameResults.length}試合)`
                  : '\u200b',
              value: line,
            });
          },
        );

        // ツールチップを追加
        footer.push(
          '「/status user <名前>」でユーザーの過去イベントの参加状況を確認できます',
        );
      } else {
        // イベントが終了していない場合は、イベント終了後に参加者が表示される旨を記載
        embeds.addFields({
          name: '参加者/戦績',
          value: `イベント終了後、ここに参加者が表示されます\n参加したい人は[「興味あり」](https://discord.com/events/${config.guild_id}/${event.eventId})を押すと特殊な通知を受け取れます！`,
        });

        // メッセージにもリンクを乗せる
        if (message && eventLinkMessage) {
          message += `\n\n[${eventLinkMessage}](https://discord.com/events/${config.guild_id}/${event.eventId})`;
        }
      }

      // 試合結果のプルダウンを追加
      if (gameResults.length > 0) {
        components.push(
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            statusGameMenuAction.create(event, gameResults),
          ),
        );

        // ツールチップを追加
        footer.push('下記プルダウンから各試合結果を確認できます');
      }
    }

    // ツールチップを追加
    footer.push(`イベントID: ${event.id}`);

    // フッター
    embeds.setFooter({
      text: footer.join('\n'),
    });

    // 送信内容
    return {
      content: message,
      embeds: [embeds],
      components,
    };
  }

  /**
   * メッセージからイベントIDを抽出
   * @param message Discordメッセージ
   * @returns イベントID
   */
  async parseEventIdFromMessage(message: Message): Promise<number | null> {
    if (message.embeds.length === 0) return null;
    const embed = message.embeds[0];
    if (!embed.url) return null;

    // フッターからイベントIDを抽出（より確実）
    if (embed.footer?.text) {
      const footerMatch = embed.footer.text.match(/イベントID: (\d+)/);
      if (footerMatch) {
        return parseInt(footerMatch[1]);
      }
    }

    // イベントURLからDiscordイベントIDを抽出
    const urlMatch = embed.url.match(
      /^https:\/\/discord\.com\/events\/\d+\/(\d+)$/,
    );
    if (!urlMatch) return null;

    const discordEventId = urlMatch[1];

    // DiscordイベントIDからデータベースのイベントを検索
    const event = await prisma.event.findFirst({
      where: { eventId: discordEventId },
    });

    return event?.id ?? null;
  }

  /**
   * イベント情報を表示します
   * @param interaction インタラクション
   * @param event イベント
   * @param webhookChannel Webhookのチャンネル
   * @param message Webhookで送信するメッセージ
   * @param eventLinkMessage イベントリンクに表示するメッセージ
   * @param editMessage 編集するメッセージ
   * @returns 送信したメッセージ
   */
  async showEvent(
    interaction: RepliableInteraction,
    event: EventWithHost,
    webhookChannel?: TextBasedChannel,
    message?: string,
    eventLinkMessage?: string,
    editMessage?: Message,
  ): Promise<Message | undefined> {
    // 集計
    if (event.active === (GuildScheduledEventStatus.Active as number)) {
      await updateAttendanceTime(event, new Date());
    }

    // Webhookを取得
    const webhook = !webhookChannel
      ? undefined
      : await getWebhookFromInteraction(interaction, webhookChannel);
    if (webhookChannel && !webhook) {
      return;
    }

    // 送信内容
    const contents = await this.createEventMessage(
      event,
      message,
      eventLinkMessage,
    );

    let sentMessage: Message | undefined;
    if (webhook) {
      // Webhookで送信 (コマンド送信者の名前とアイコンを表示)
      // 主催者がいる場合は主催者の情報を優先
      const member =
        event.host ??
        (await userManager.getOrCreateUser(
          interaction.member ?? interaction.user,
        ));
      const memberDisplayName = userManager.getUserName(member);
      const memberAvatar = userManager.getUserAvatar(member);
      if (editMessage) {
        // 既存メッセージを編集
        sentMessage = await webhook.webhook.editMessage(editMessage, contents);
      } else {
        sentMessage = await webhook.webhook.send({
          threadId: webhook.thread?.id,
          username: memberDisplayName,
          avatarURL: memberAvatar,
          ...contents,
        });
      }
    } else {
      // 通常送信
      sentMessage = await interaction.editReply(contents);
    }

    // メッセージの更新ではなく、イベントチャンネルの場合
    if (
      !editMessage &&
      webhookChannel &&
      (webhookChannel.type === ChannelType.GuildAnnouncement ||
        webhookChannel.type === ChannelType.GuildText) &&
      webhookChannel.id === config.announcement_channel_id
    ) {
      // メッセージを公開
      await sentMessage?.crosspost().catch((e) => {
        // エラーが発生した場合はログを出力して続行
        logger.error('メッセージの公開に失敗しました。', e);
      });

      // 最新のアーカイブ済みスレッドを取得
      try {
        const threads = await webhookChannel.threads.fetchActive();
        for (const [, thread] of threads.threads) {
          // 1日以上前のスレッドかどうかを判定
          if (
            thread.createdAt &&
            new Date().getTime() - thread.createdAt.getTime() <
              24 * 60 * 60 * 1000
          ) {
            // 1日以内のスレッドはスキップ
            continue;
          }

          const fetched = await thread.messages.fetch({ limit: 1 });
          const lastMessage = fetched.first();
          // イベントの思い出を記録しておきましょう！というBOTのメッセージが取得できた場合、そのスレッドには何も投稿されていないため、そのスレッドを削除する
          if (
            lastMessage &&
            lastMessage.author.id === client.user?.id &&
            lastMessage.content.includes(
              'イベントの思い出を記録しておきましょう！',
            )
          ) {
            // スレッドを削除
            await thread.delete();
          } else {
            // それ以外の場合はスレッドをアーカイブ
            await thread.setArchived(true);
          }
        }
      } catch (error) {
        logger.error(
          'イベントチャンネルの旧スレッド削除に失敗しました。',
          error,
        );
      }

      // スレッドを作成してリプライ
      try {
        // 日付を取得して文字列(◯◯/◯◯)に変換
        const date = event.scheduleTime
          ? `${String(event.scheduleTime.getMonth() + 1).padStart(2, '0')}/${String(event.scheduleTime.getDate()).padStart(2, '0')}`
          : '未定';
        const thread = await webhookChannel.threads.create({
          name: `${date} ${event.name}`,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
          startMessage: sentMessage,
        });
        if (thread) {
          await thread.send({
            content:
              'イベントの思い出を記録しておきましょう！\n- ⭕イベントの感想\n- ⭕イベントで取ったスクショ/動画\n- ⭕戦績のメモなど\n- ❌会話や議論などの後で見返しても役に立たない情報',
            target: sentMessage,
          });
        }
      } catch (error) {
        logger.error('イベントチャンネルのスレッド作成に失敗しました。', error);
      }
    }

    return sentMessage;
  }
}

export default new EventInfoMessageUpdater();
