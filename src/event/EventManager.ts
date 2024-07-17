import { GuildScheduledEvent, Interaction } from 'discord.js';
import { prisma } from '../index.js';
import { Event, Prisma } from '@prisma/client';

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
   * @param eventId DiscordのイベントID
   * @returns イベント
   */
  async getEventFromDiscordId(
    eventId: string | undefined,
  ): Promise<Event | null> {
    return await prisma.event.findFirst({
      where: {
        eventId,
      },
      orderBy: {
        startTime: 'desc',
      },
      take: 1,
    });
  }

  /**
   * IDからイベントを取得します
   * @param eventId イベントID
   * @returns イベント
   */
  async getEventFromId(eventId: number | undefined): Promise<Event | null> {
    if (eventId !== undefined) {
      return await prisma.event.findUnique({
        where: {
          id: eventId,
        },
      });
    } else {
      return await prisma.event.findFirst({
        orderBy: {
          startTime: 'desc',
        },
        take: 1,
      });
    }
  }

  /**
   * 選択中のイベントを取得します
   * @param interaction インタラクション
   * @param active true=開催中のイベント/false=開始前のイベントのみ取得するか
   * @returns イベント
   */
  async getEvent(
    interaction: Interaction,
    active = true,
  ): Promise<Event | null> {
    // 選択されている場合は選択中のイベントを取得
    const selectedEventId = this._selectedEvents[interaction.user.id];
    if (selectedEventId) {
      return await prisma.event.findUnique({
        where: {
          id: selectedEventId,
        },
      });
    }

    // 前後3時間以内のイベントを取得
    const timeMargin = 3 * 60 * 60 * 1000;
    // activeに応じた条件
    const where = active
      ? // 開催中のイベントの場合は開始しているものも取得
        {
          active,
        }
      : // 開催前のイベントの場合は終了していないもののみ取得
        {
          active,
          startTime: {
            equals: null,
          },
          endTime: {
            equals: null,
          },
          scheduleTime: {
            gte: new Date(Date.now() - timeMargin),
            lte: new Date(Date.now() + timeMargin),
          },
        };
    // activeに応じた並び順
    const orderBy: {
      startTime?: Prisma.SortOrder;
      scheduleTime?: Prisma.SortOrder;
    } = active
      ? {
          startTime: 'desc',
        }
      : {
          scheduleTime: 'asc',
        };

    // コマンドを打ったVCチャンネルで開催中のイベントを取得
    if (interaction.channel?.isVoiceBased()) {
      const event = await prisma.event.findFirst({
        where: {
          channelId: interaction.channel.id,
          ...where,
        },
        orderBy,
        take: 1,
      });
      if (event) {
        return event;
      }
    }

    // 入っているVC で開催中のイベントを取得
    const voiceChannel = interaction.guild?.members.resolve(interaction.user)
      ?.voice.channel;
    if (voiceChannel) {
      const event = await prisma.event.findFirst({
        where: {
          channelId: voiceChannel.id,
          ...where,
        },
        orderBy,
        take: 1,
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
      });
      if (event) {
        return event;
      }
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
    return interaction.guild?.scheduledEvents.fetch(event.eventId);
  }
}

export default new EventManager();
