import {
  GuildScheduledEvent,
  GuildScheduledEventStatus,
  Interaction,
  TextBasedChannel,
  VoiceBasedChannel,
} from 'discord.js';
import { prisma } from '@/utils/prisma';
import { Event, Prisma } from '@prisma/client';
import { userManager } from './UserManager';
import { logger } from '@/utils/log';
import { eventIncludeHost, EventWithHost } from '@/domain/queries/eventQueries';

/**
 * イベント情報を取得します
 */
class EventManager {
  /**
   * ユーザーが選択したイベント
   */
  private _selectedEvents: Record<string, number> = {};

  /**
   * イベントを選択します
   * @param userId ユーザーID
   * @param eventId イベントID
   */
  selectEvent(userId: string, eventId?: number): void {
    if (!eventId) {
      delete this._selectedEvents[userId];
    } else {
      this._selectedEvents[userId] = eventId;
    }
  }

  /**
   * DiscordのイベントIDからイベントを取得します
   * @param scheduledEventId DiscordのイベントID
   * @returns イベント
   */
  async getEventFromDiscordId(
    scheduledEventId: string | undefined,
  ): Promise<EventWithHost | null> {
    // 開催中のものを優先して取得
    {
      const event = await prisma.event.findFirst({
        where: {
          eventId: scheduledEventId,
          active: GuildScheduledEventStatus.Active,
        },
        orderBy: {
          startTime: 'desc', // 開催中のものは開始時間の新しいものを取得
        },
        take: 1,
        ...eventIncludeHost,
      });
      if (event) return event;
    }
    {
      const event = await prisma.event.findFirst({
        where: {
          eventId: scheduledEventId,
          active: GuildScheduledEventStatus.Scheduled,
        },
        orderBy: {
          scheduleTime: 'desc', // 開催前のものはスケジュール時間の新しいものを取得
        },
        take: 1,
        ...eventIncludeHost,
      });
      if (event) return event;
    }
    return null;
  }

  /**
   * IDからイベントを取得します
   * @param eventId イベントID
   * @returns イベント
   */
  async getEventFromId(
    eventId: number | undefined,
  ): Promise<EventWithHost | null> {
    if (eventId !== undefined) {
      return await prisma.event.findUnique({
        where: {
          id: eventId,
        },
        ...eventIncludeHost,
      });
    } else {
      return await prisma.event.findFirst({
        orderBy: {
          startTime: 'desc',
        },
        take: 1,
        ...eventIncludeHost,
      });
    }
  }

  /**
   * 選択中のイベントを取得します (チャンネルを指定して取得)
   * @param commandChannel コマンドを打ったチャンネル
   * @param voiceChannel トーク中のチャンネル
   * @param active true=開催中のイベント/false=開始前のイベントのみ取得するか
   * @returns イベント
   */
  async getRecentEvent(
    commandChannel?: TextBasedChannel,
    voiceChannel?: VoiceBasedChannel,
    active = GuildScheduledEventStatus.Active,
  ): Promise<EventWithHost | null> {
    // 前後3時間以内のイベントを取得
    const timeMargin = 3 * 60 * 60 * 1000;
    // activeに応じた条件
    let where: Prisma.EventWhereInput;
    switch (active) {
      case GuildScheduledEventStatus.Active:
        where = {
          active: GuildScheduledEventStatus.Active,
        };
        break;
      case GuildScheduledEventStatus.Scheduled:
        where = {
          active: GuildScheduledEventStatus.Scheduled,
          startTime: {
            equals: null,
          },
          endTime: {
            equals: null,
          },
          scheduleTime: {
            gte: new Date(Date.now() - timeMargin),
            lt: new Date(Date.now() + timeMargin),
          },
        };
        break;
      case GuildScheduledEventStatus.Completed:
        where = {
          active: GuildScheduledEventStatus.Completed,
          startTime: {
            gte: new Date(Date.now() - timeMargin),
            lt: new Date(Date.now() + timeMargin),
          },
        };
        break;
      default:
        // その他(キャンセルされたイベントなど)は非対応
        return null;
    }

    // activeに応じた並び順
    let orderBy: Prisma.EventOrderByWithRelationInput;
    switch (active) {
      case GuildScheduledEventStatus.Active:
        orderBy = {
          startTime: 'desc',
        };
        break;
      case GuildScheduledEventStatus.Scheduled:
        orderBy = {
          scheduleTime: 'asc',
        };
        break;
      case GuildScheduledEventStatus.Completed:
        orderBy = {
          startTime: 'desc',
        };
        break;
      default:
        // その他(キャンセルされたイベントなど)は非対応
        return null;
    }

    // コマンドを打ったVCチャンネルで開催中のイベントを取得
    if (commandChannel?.isVoiceBased()) {
      const event = await prisma.event.findFirst({
        where: {
          channelId: commandChannel.id,
          ...where,
        },
        orderBy,
        take: 1,
        ...eventIncludeHost,
      });
      if (event) {
        return event;
      }
    }

    // 入っているVC で開催中のイベントを取得
    if (voiceChannel) {
      const event = await prisma.event.findFirst({
        where: {
          channelId: voiceChannel.id,
          ...where,
        },
        orderBy,
        take: 1,
        ...eventIncludeHost,
      });
      if (event) {
        return event;
      }
    }

    // コマンドを打ったVCチャンネル/入っているVC で開催中のイベントが見つからない場合はその他で開催中のイベントを取得
    {
      const event = await prisma.event.findFirst({
        where,
        orderBy,
        take: 1,
        ...eventIncludeHost,
      });
      if (event) {
        return event;
      }
    }

    // それでも見つからない場合は諦める
    return null;
  }

  /**
   * 選択中のイベントを取得します
   * @param interaction インタラクション
   * @param active true=開催中のイベント/false=開始前のイベントのみ取得するか
   * @returns イベント
   */
  async getEvent(
    interaction: Interaction,
    active = GuildScheduledEventStatus.Active,
  ): Promise<EventWithHost | null> {
    // 選択されている場合は選択中のイベントを取得
    const selectedEventId = this._selectedEvents[interaction.user.id];
    if (selectedEventId) {
      return await prisma.event.findUnique({
        where: {
          id: selectedEventId,
        },
        ...eventIncludeHost,
      });
    }

    // 前後3時間以内のイベントを取得
    const event = await this.getRecentEvent(
      interaction.channel ?? undefined,
      interaction.guild?.members.cache.get(interaction.user.id)?.voice
        .channel ?? undefined,
      active,
    );
    if (event) {
      return event;
    }

    // 開催中のイベントが見つからない場合は終了後のイベントを取得
    if (active === GuildScheduledEventStatus.Active) {
      return await this.getRecentEvent(
        interaction.channel ?? undefined,
        interaction.guild?.members.cache.get(interaction.user.id)?.voice
          .channel ?? undefined,
        GuildScheduledEventStatus.Completed,
      );
    }

    // それでも見つからない場合は諦める
    return null;
  }

  /**
   * EventからDiscordのScheduleEventを取得します
   * @param interaction インタラクション
   * @param event イベント
   * @returns ScheduleEvent
   */
  async getScheduleEvent(
    interaction: Interaction,
    event: Event | null,
  ): Promise<GuildScheduledEvent | undefined> {
    if (!event) {
      return;
    }
    return interaction.guild?.scheduledEvents
      .fetch(event.eventId)
      .catch(() => undefined);
  }

  /**
   * Discordイベントの説明文を更新します
   * @param scheduledEvent Discordイベント
   * @param event イベント
   * @returns 更新に成功したかどうか
   */
  async updateEventDescription(
    scheduledEvent: GuildScheduledEvent,
    event?: EventWithHost,
  ): Promise<void> {
    try {
      // 新しい説明文を生成
      const newDescription = this.formatEventDescription(
        scheduledEvent.description,
        event,
      );

      // 説明文が同じ場合はスキップ（Discord側のトリミング動作に対応）
      if (scheduledEvent.description?.trim() !== newDescription.trim()) {
        // 説明文を更新
        await scheduledEvent.edit({
          description: newDescription,
        });
      }
    } catch (error) {
      logger.error('イベントの説明文の更新に失敗しました:', error);
    }
  }

  /**
   * イベントの説明文を加工します
   * @param description 元の説明文
   * @param event イベント
   * @returns 加工後の説明文
   */
  formatEventDescription(
    description: string | null,
    event?: EventWithHost,
  ): string {
    // 説明文を作成
    const lines = (description ?? '').split('\n');

    // 後方互換性のため、最後の行に「主催」という文字があれば削除（2行以上の場合のみ）
    if (lines.length > 1 && lines[lines.length - 1].includes('主催')) {
      lines.pop();
    }

    // 先頭の行から既存の主催者情報を削除
    if (lines.length > 0) {
      lines[0] = lines[0].replace(/^≪.*?主催≫\s*/, '');
    }

    // 末尾から既存のイベントID情報を削除
    const eventIdRegex = /\s*\(イベントID:\s*\d+\)$/;
    if (lines.length > 0) {
      lines[lines.length - 1] = lines[lines.length - 1].replace(
        eventIdRegex,
        '',
      );
    }

    // 主催者の文言を先頭の行に統合
    if (event?.host) {
      if (lines.length > 0) {
        lines[0] = `≪${userManager.getUserName(event.host)}主催≫ ${lines[0]}`;
      } else {
        lines.push(`≪${userManager.getUserName(event.host)}主催≫`);
      }
    }

    // イベントIDを末尾に追加
    if (event) {
      if (lines.length > 0) {
        lines[lines.length - 1] =
          `${lines[lines.length - 1]} (イベントID: ${event.id})`;
      } else {
        lines.push(`(イベントID: ${event.id})`);
      }
    }

    return lines.join('\n');
  }
}

/**
 * イベントマネージャーのインスタンス
 */
export const eventManager = new EventManager();
