/**
 * カレンダーメッセージ用のMessageUpdater実装
 * カレンダー形式のイベント一覧メッセージの判定・更新・取得を担当
 */
import { Message, GuildScheduledEventStatus, MessageFlags } from 'discord.js';
import { EventWithHost, eventIncludeHost } from '../event/EventManager.js';
import { MessageUpdater, MessageUpdateContext } from './MessageUpdater.js';
import { config } from '../utils/config.js';
import { client } from '../utils/client.js';
import { prisma } from '../utils/prisma.js';
import messageEditor from '../event/MessageEditor.js';
import { ScheduleMessageData } from '../commands/event_creator_command/schedule/types.js';

/**
 * カレンダーメッセージ用のMessageUpdater実装
 * カレンダー形式のイベント一覧メッセージの判定・更新・取得を担当
 */
class CalendarMessageUpdater implements MessageUpdater {
  /**
   * カレンダーメッセージかどうかを判定
   * @param message Discordメッセージ
   * @returns 判定結果
   */
  canParseMessage(message: Message): boolean {
    return /^## 📆 (?:.+)\n-# <t:(\d+):D> 〜 <t:(\d+):D>\n気になるイベントがあったら↓/.test(
      message.content,
    );
  }

  /**
   * カレンダーメッセージを更新
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
      throw new Error('このメッセージはカレンダーメッセージではありません');
    }
    const calendarText = this.createCalendarText(
      data.events,
      data.start,
      data.end,
    );
    return await messageEditor.editMessage(message, {
      content: calendarText,
      flags: MessageFlags.SuppressEmbeds,
    });
  }

  /**
   * 関連するカレンダーメッセージを取得
   * @param event イベント
   * @returns 関連メッセージ配列
   */
  async getRelatedMessages(event: EventWithHost): Promise<Message[]> {
    const messages: Message[] = [];
    const channelId = config.schedule_channel_id;
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
    // 期間情報を抽出（例: <t:1234567890:D> 〜 <t:1234567891:D>）
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
   * カレンダーメッセージ本文を生成
   * @param events イベント配列
   * @param start 開始日
   * @param end 終了日
   * @returns メッセージ本文
   */
  createCalendarText(events: EventWithHost[], start: Date, end: Date): string {
    const baseTitle = '今週のイベントリスト';
    const titleChars = [...baseTitle.split('')];

    // イベント数に応じて「!」を追加
    while (titleChars.length < events.length) {
      titleChars.push('!');
    }

    // タイトルの文字にURLを付ける
    const titleWithLinks = titleChars
      .map((char, index) => {
        if (index < events.length) {
          const event = events[index];
          return `[${char}](https://discord.com/events/${config.guild_id}/${event.eventId})`;
        }
        return char;
      })
      .join('');

    // 日付範囲を小さく表示
    const startUnix = Math.floor(start.getTime() / 1000);
    const endUnix = Math.floor(end.getTime() / 1000 - 1);
    const dateLine = `-# <t:${startUnix}:D> 〜 <t:${endUnix}:D>`;

    return `## 📆 ${titleWithLinks}\n${dateLine}\n気になるイベントがあったら↓の「興味あり」ボタンを押してください！ (開始時に**特別な通知**が来ます！)`;
  }
}

export default new CalendarMessageUpdater();
