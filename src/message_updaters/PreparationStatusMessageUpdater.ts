import {
  Message,
  GuildScheduledEventStatus,
  MessageFlags,
  EmbedBuilder,
} from 'discord.js';
import { EventWithHost, eventIncludeHost } from '../event/EventManager.js';
import { MessageUpdater, MessageUpdateContext } from './MessageUpdater.js';
import { config } from '../utils/config.js';
import { client } from '../utils/client.js';
import { prisma } from '../utils/prisma.js';
import messageEditor from '../event/MessageEditor.js';
import { ScheduleMessageData } from '../commands/event_creator_command/schedule/types.js';

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
    return /^## 📝 準備状況パネル\n-# <t:(\d+):D> 〜 <t:(\d+):D>/.test(
      message.content,
    );
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
    const data = await this._parseScheduleMessage(message);
    if (!data) {
      throw new Error('このメッセージは準備状況メッセージではありません');
    }
    const { content, embed } = this.createPreparationStatusText(
      data.events,
      data.start,
      data.end,
    );

    return await messageEditor.editMessage(message, {
      content: content,
      embeds: [embed],
      flags: MessageFlags.SuppressEmbeds,
      allowedMentions: { users: [] },
    });
  }

  /**
   * 関連する準備状況メッセージを取得
   * @param event イベント
   * @returns 関連メッセージ配列
   */
  async getRelatedMessages(event: EventWithHost): Promise<Message[]> {
    const messages: Message[] = [];
    const channelId = config.event_panel_channel_id; // Use event_panel_channel_id as per spec
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return messages;
    const fetchedMessages = await channel.messages.fetch({ limit: 100 });
    for (const [, message] of fetchedMessages) {
      const data = await this._parseScheduleMessage(message);
      if (data && data.events.some((e) => e.id === event.id)) {
        messages.push(message);
      }
    }
    return messages;
  }

  /**
   * メッセージからScheduleMessageDataをパース
   * @param message Discordメッセージ
   * @returns ScheduleMessageDataまたはnull
   */
  private async _parseScheduleMessage(
    message: Message,
  ): Promise<ScheduleMessageData | null> {
    if (!this.canParseMessage(message)) return null;
    // 期間情報を抽出（例: <t:1234567890:D> 〜 <t:1234567891:D>
    const timeMatch = message.content.match(/<t:(\d+):D> 〜 <t:(\d+):D>/);
    if (!timeMatch) return null;
    const start = new Date(parseInt(timeMatch[1]) * 1000);
    const end = new Date(parseInt(timeMatch[2]) * 1000);
    // イベント情報を取得
    const events: EventWithHost[] = await prisma.event.findMany({
      where: {
        active: {
          not: GuildScheduledEventStatus.Canceled,
        },
        scheduleTime: {
          gte: start,
          lt: end,
        },
      },
      orderBy: [
        {
          scheduleTime: 'asc',
        },
      ],
      ...eventIncludeHost,
    });
    return new ScheduleMessageData(start, end, events);
  }

  /**
   * 準備状況メッセージ本文を生成
   * @param events イベント配列
   * @param start 開始日
   * @param end 終了日
   * @returns メッセージ本文
   */
  createPreparationStatusText(
    events: EventWithHost[],
    start: Date,
    end: Date,
  ): { content: string; embed: EmbedBuilder } {
    const startUnix = Math.floor(start.getTime() / 1000);
    const endUnix = Math.floor(end.getTime() / 1000 - 1);
    const dateLine = `-# <t:${startUnix}:D> 〜 <t:${endUnix}:D>`;
    const headerContent = `## 📝 準備状況パネル\n${dateLine}\n\n`;

    let eventListText = '';
    if (events.length === 0) {
      eventListText = '今週のイベントはありません。';
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
}

export default new PreparationStatusMessageUpdater();
