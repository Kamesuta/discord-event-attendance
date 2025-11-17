import {
  Message,
  GuildScheduledEventStatus,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
} from 'discord.js';
import { EventWithHost, eventIncludeHost } from '../event/EventManager.js';
import { MessageUpdater, MessageUpdateContext } from './MessageUpdater.js';
import { config } from '../utils/config.js';
import { client } from '../utils/client.js';
import { prisma } from '../utils/prisma.js';
import { messageEditor } from '../utils/discord/MessageEditor.js';
import { preparationStatusReportButtonAction } from '../commands/action/preparation_status_command/PreparationStatusReportButtonAction.js';

/**
 * 準備状況メッセージ用のMessageUpdater実装
 * 準備状況パネルメッセージの判定・更新・取得を担当
 */
class PreparationStatusMessageUpdater implements MessageUpdater {
  /**
   * 準備状況メッセージかどうかを判定
   * @param message Discordメッセージ
   * @returns 判定結果
   */
  canParseMessage(message: Message): boolean {
    return message.content.startsWith('## 📝 準備状況パネル');
  }

  /**
   * 準備状況メッセージを更新
   * @param message Discordメッセージ
   * @param _context 更新コンテキスト（スケジュールメッセージでは無視）
   * @returns 更新されたメッセージ
   */
  async updateMessage(
    message: Message,
    _context?: MessageUpdateContext,
  ): Promise<Message | undefined> {
    const events = await this.fetchEvents();
    const { content, embed } = this.createPreparationStatusText(events);

    return await messageEditor.editMessage(message, {
      content: content,
      embeds: [embed],
      components: this.createPreparationStatusComponents(),
      allowedMentions: { users: [] },
    });
  }

  /**
   * 関連する準備状況メッセージを取得
   * @param _event イベント
   * @returns 関連メッセージ配列
   */
  async getRelatedMessages(_event: EventWithHost): Promise<Message[]> {
    const messages: Message[] = [];
    const channelId = config.event_panel_channel_id;
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return messages;
    const fetchedMessages = await channel.messages.fetch({ limit: 100 });
    for (const [, message] of fetchedMessages) {
      if (this.canParseMessage(message)) {
        messages.push(message);
      }
    }
    return messages;
  }

  /**
   * メッセージからScheduleMessageDataをパース
   * @returns ScheduleMessageDataまたはnull
   */
  async fetchEvents(): Promise<EventWithHost[]> {
    // イベント情報を取得 (期間フィルタなし)
    const events: EventWithHost[] = await prisma.event.findMany({
      where: {
        active: GuildScheduledEventStatus.Scheduled,
      },
      orderBy: [
        {
          scheduleTime: 'asc',
        },
      ],
      ...eventIncludeHost,
    });
    return events;
  }

  /**
   * 準備状況メッセージ本文を生成
   * @param events イベント配列
   * @returns メッセージ本文
   */
  createPreparationStatusText(events: EventWithHost[]): {
    content: string;
    embed: EmbedBuilder;
  } {
    const headerContent = `## 📝 準備状況パネル\n\n`;

    let eventListText = '';
    if (events.length === 0) {
      eventListText = '登録されているイベントはありません。';
    } else {
      eventListText = events
        .map((event) => {
          const dateStr = event.scheduleTime
            ? `<t:${Math.floor(event.scheduleTime.getTime() / 1000)}:D>`
            : '未定';
          const eventLink = `https://discord.com/events/${config.guild_id}/${event.eventId}`;
          const hostName = event.host?.userId
            ? `<@${event.host.userId}>`
            : 'なし';
          const preparer = event.preparer?.userId
            ? `<@${event.preparer?.userId}>`
            : 'なし';
          const status = event.preparerId
            ? event.prepareStatus
              ? '✅ 準備完了'
              : '❌ 未完了'
            : '準備不要';

          return (
            `- ${dateStr} [「${event.name}」](${eventLink})(ID: ${event.id})\n` +
            `    - 主催者: ${hostName}, 準備者: ${preparer}, 状況: ${status}`
          );
        })
        .join('\n');
    }

    const embed = new EmbedBuilder()
      .setTitle('🥳イベント準備状況')
      .setDescription(eventListText)
      .setColor('#ff8c00');

    return { content: headerContent, embed: embed };
  }

  /**
   * 準備状況パネル下部のコンポーネント群を生成
   * @returns コンポーネント群
   */
  createPreparationStatusComponents(): ActionRowBuilder<ButtonBuilder>[] {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        preparationStatusReportButtonAction.create(),
      ),
    ];
  }
}

/**
 * PreparationStatusMessageUpdaterのインスタンス
 */
export const preparationStatusMessageUpdater =
  new PreparationStatusMessageUpdater();
