import {
  GuildScheduledEvent,
  GuildScheduledEventStatus,
  Interaction,
  TextBasedChannel,
  VoiceBasedChannel,
} from 'discord.js';
import { prisma } from '../index.js';
import { Event, Prisma } from '@prisma/client';

/**
 * イベントの取得条件
 */
export const eventIncludeHost = {
  include: {
    host: true,
  },
};

/**
 * イベントにホストを含む型
 */
export type EventWithHost = Prisma.EventGetPayload<typeof eventIncludeHost>;

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
}

export default new EventManager();
