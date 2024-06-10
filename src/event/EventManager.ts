import { GuildScheduledEvent, Interaction } from 'discord.js';
import { prisma } from '../index.js';
import { Event } from '@prisma/client';

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
    return await prisma.event.findUnique({
      where: {
        id: eventId,
      },
    });
  }

  /**
   * 選択中のイベントを取得します
   * @param interaction インタラクション
   * @returns イベント
   */
  async getEvent(interaction: Interaction): Promise<Event | null> {
    // 選択されている場合は選択中のイベントを取得
    const selectedEventId = this._selectedEvents[interaction.user.id];
    if (selectedEventId) {
      return await prisma.event.findUnique({
        where: {
          id: selectedEventId,
        },
      });
    }

    // コマンドを打ったVCチャンネルで開催中のイベントを取得
    if (interaction.channel?.isVoiceBased()) {
      const event = await prisma.event.findFirst({
        where: {
          channelId: interaction.channel.id,
          active: true,
        },
        orderBy: {
          startTime: 'desc',
        },
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
          active: true,
        },
        orderBy: {
          startTime: 'desc',
        },
        take: 1,
      });
      if (event) {
        return event;
      }
    }

    // それでも見つからない場合は過去の最新イベントを取得
    return await prisma.event.findFirst({
      orderBy: {
        startTime: 'desc',
      },
      take: 1,
    });
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
