import { Event, Prisma } from '@prisma/client';
import { GuildScheduledEventStatus } from 'discord.js';
import { AbstractBaseRepository } from './BaseRepository.js';
import {
  EventWithHost,
  EventWithStats,
  EventWithFull,
  EventCreateData,
  EventUpdateData,
  EventSearchOptions,
  EventStatistics,
  eventIncludeHost,
  eventIncludeStats,
  eventIncludeFull,
} from '../../types/event.js';
import { logger } from '../../utils/log.js';

/**
 * イベントのRepositoryクラス
 * イベント固有のデータベース操作を提供
 */
export class EventRepository extends AbstractBaseRepository<
  Event,
  Prisma.EventCreateInput,
  Prisma.EventUpdateInput,
  Prisma.EventWhereInput,
  Prisma.EventWhereUniqueInput
> {
  protected getModelName(): string {
    return 'Event';
  }

  protected getModel() {
    return this.prisma.event;
  }

  /**
   * Discord イベントIDでイベントを取得
   */
  public async findByDiscordEventId(
    scheduledEventId: string,
  ): Promise<EventWithHost | null> {
    try {
      logger.debug('Discord イベントIDでイベントを検索中:', { scheduledEventId });

      // 開催中のものを優先して取得
      const activeEvent = await this.prisma.event.findFirst({
        where: {
          eventId: scheduledEventId,
          active: GuildScheduledEventStatus.Active,
        },
        orderBy: {
          startTime: 'desc',
        },
        take: 1,
        ...eventIncludeHost,
      });

      if (activeEvent) {
        logger.debug('開催中のイベントを発見:', { id: activeEvent.id });
        return activeEvent;
      }

      // 開催前のものを取得
      const scheduledEvent = await this.prisma.event.findFirst({
        where: {
          eventId: scheduledEventId,
          active: GuildScheduledEventStatus.Scheduled,
        },
        orderBy: {
          scheduleTime: 'desc',
        },
        take: 1,
        ...eventIncludeHost,
      });

      if (scheduledEvent) {
        logger.debug('開催前のイベントを発見:', { id: scheduledEvent.id });
      }

      return scheduledEvent;
    } catch (error) {
      logger.error('Discord イベントIDでの検索に失敗:', { scheduledEventId, error });
      throw this.handleError(error);
    }
  }

  /**
   * 最新のイベントを取得
   */
  public async findLatest(): Promise<EventWithHost | null> {
    try {
      logger.debug('最新のイベントを検索中');
      
      const event = await this.prisma.event.findFirst({
        orderBy: {
          startTime: 'desc',
        },
        take: 1,
        ...eventIncludeHost,
      });

      return event;
    } catch (error) {
      logger.error('最新イベントの取得に失敗:', error);
      throw this.handleError(error);
    }
  }

  /**
   * 条件に基づいて最近のイベントを取得
   */
  public async findRecentEvent(
    options: {
      channelId?: string;
      active?: GuildScheduledEventStatus;
      timeMargin?: number;
    } = {},
  ): Promise<EventWithHost | null> {
    try {
      const { channelId, active = GuildScheduledEventStatus.Active, timeMargin = 3 * 60 * 60 * 1000 } = options;
      
      logger.debug('条件に基づいて最近のイベントを検索中:', options);

      // 条件の構築
      let where: Prisma.EventWhereInput;
      let orderBy: Prisma.EventOrderByWithRelationInput;

      switch (active) {
        case GuildScheduledEventStatus.Active:
          where = {
            active: GuildScheduledEventStatus.Active,
            ...(channelId && { channelId }),
          };
          orderBy = { startTime: 'desc' };
          break;

        case GuildScheduledEventStatus.Scheduled:
          where = {
            active: GuildScheduledEventStatus.Scheduled,
            startTime: { equals: null },
            endTime: { equals: null },
            scheduleTime: {
              gte: new Date(Date.now() - timeMargin),
              lt: new Date(Date.now() + timeMargin),
            },
            ...(channelId && { channelId }),
          };
          orderBy = { scheduleTime: 'asc' };
          break;

        case GuildScheduledEventStatus.Completed:
          where = {
            active: GuildScheduledEventStatus.Completed,
            startTime: {
              gte: new Date(Date.now() - timeMargin),
              lt: new Date(Date.now() + timeMargin),
            },
            ...(channelId && { channelId }),
          };
          orderBy = { startTime: 'desc' };
          break;

        default:
          return null;
      }

      const event = await this.prisma.event.findFirst({
        where,
        orderBy,
        take: 1,
        ...eventIncludeHost,
      });

      if (event) {
        logger.debug('条件に合致するイベントを発見:', { id: event.id });
      }

      return event;
    } catch (error) {
      logger.error('最近のイベント検索に失敗:', { options, error });
      throw this.handleError(error);
    }
  }

  /**
   * 統計情報付きでイベントを取得
   */
  public async findWithStats(id: number): Promise<EventWithStats | null> {
    try {
      logger.debug('統計情報付きでイベントを取得中:', { id });
      
      const event = await this.prisma.event.findUnique({
        where: { id },
        ...eventIncludeStats,
      });

      return event;
    } catch (error) {
      logger.error('統計情報付きイベント取得に失敗:', { id, error });
      throw this.handleError(error);
    }
  }

  /**
   * 完全な情報付きでイベントを取得
   */
  public async findWithFull(id: number): Promise<EventWithFull | null> {
    try {
      logger.debug('完全な情報付きでイベントを取得中:', { id });
      
      const event = await this.prisma.event.findUnique({
        where: { id },
        ...eventIncludeFull,
      });

      return event;
    } catch (error) {
      logger.error('完全な情報付きイベント取得に失敗:', { id, error });
      throw this.handleError(error);
    }
  }

  /**
   * 高度な検索条件でイベントを検索
   */
  public async searchEvents(options: EventSearchOptions): Promise<EventWithHost[]> {
    try {
      logger.debug('高度な検索条件でイベントを検索中:', options);
      
      const { eventId, channelId, active, timeMargin = 3 * 60 * 60 * 1000 } = options;
      
      const where: Prisma.EventWhereInput = {};
      
      if (eventId) {
        where.eventId = eventId;
      }
      
      if (channelId) {
        where.channelId = channelId;
      }
      
      if (active !== undefined) {
        where.active = active;
        
        // 時間条件の追加
        if (active === GuildScheduledEventStatus.Scheduled) {
          where.scheduleTime = {
            gte: new Date(Date.now() - timeMargin),
            lt: new Date(Date.now() + timeMargin),
          };
        } else if (active === GuildScheduledEventStatus.Completed) {
          where.startTime = {
            gte: new Date(Date.now() - timeMargin),
            lt: new Date(Date.now() + timeMargin),
          };
        }
      }

      const events = await this.prisma.event.findMany({
        where,
        orderBy: {
          startTime: 'desc',
        },
        ...eventIncludeHost,
      });

      logger.debug('検索結果:', { count: events.length });
      return events;
    } catch (error) {
      logger.error('高度な検索に失敗:', { options, error });
      throw this.handleError(error);
    }
  }

  /**
   * イベントの統計情報を計算
   */
  public async getEventStatistics(eventId: number): Promise<EventStatistics> {
    try {
      logger.debug('イベントの統計情報を計算中:', { eventId });
      
      const [event, stats, voiceLogs] = await Promise.all([
        this.prisma.event.findUnique({ where: { id: eventId } }),
        this.prisma.userStat.findMany({
          where: { eventId },
          include: { user: true },
        }),
        this.prisma.voiceLog.findMany({
          where: { eventId },
          orderBy: { timestamp: 'asc' },
        }),
      ]);

      if (!event) {
        throw new Error(`Event with ID ${eventId} not found`);
      }

      const totalParticipants = stats.length;
      const totalDuration = stats.reduce((sum, stat) => sum + stat.duration, 0);
      const averageDuration = totalParticipants > 0 ? totalDuration / totalParticipants : 0;

      // ピーク参加者数の計算
      let peakParticipants = 0;
      let currentParticipants = 0;
      
      for (const log of voiceLogs) {
        if (log.join) {
          currentParticipants++;
          peakParticipants = Math.max(peakParticipants, currentParticipants);
        } else {
          currentParticipants--;
        }
      }

      const statistics: EventStatistics = {
        totalParticipants,
        totalDuration,
        averageDuration,
        peakParticipants,
      };

      logger.debug('統計情報を計算完了:', statistics);
      return statistics;
    } catch (error) {
      logger.error('統計情報の計算に失敗:', { eventId, error });
      throw this.handleError(error);
    }
  }

  /**
   * アクティブなイベントの状態を更新
   */
  public async updateEventStatus(
    id: number,
    status: GuildScheduledEventStatus,
    updateData?: {
      startTime?: Date;
      endTime?: Date;
    },
  ): Promise<Event> {
    try {
      logger.debug('イベントの状態を更新中:', { id, status, updateData });
      
      const data: Prisma.EventUpdateInput = {
        active: status,
        ...updateData,
      };

      const event = await this.prisma.event.update({
        where: { id },
        data,
      });

      logger.info('イベントの状態を更新しました:', { id, status });
      return event;
    } catch (error) {
      logger.error('イベント状態の更新に失敗:', { id, status, updateData, error });
      throw this.handleError(error);
    }
  }
}