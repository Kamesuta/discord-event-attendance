import {
  GuildScheduledEvent,
  GuildScheduledEventStatus,
  Interaction,
  TextBasedChannel,
  VoiceBasedChannel,
  User as DiscordUser,
} from 'discord.js';
import { BaseManager } from './BaseManager.js';
import { EventRepository } from '../database/repositories/EventRepository.js';
import { UserRepository } from '../database/repositories/UserRepository.js';
import {
  EventWithHost,
  EventWithStats,
  EventCreateData,
  EventUpdateData,
  EventSearchOptions,
  EventStatistics,
} from '../types/event.js';
import { User } from '@prisma/client';
import { OperationResult } from '../types/common.js';
import { logger } from '../utils/log.js';

/**
 * イベント管理クラス
 * イベントの作成、更新、検索、統計情報の取得を管理
 */
export class EventManager extends BaseManager {
  private eventRepository: EventRepository;
  private userRepository: UserRepository;
  private selectedEvents: Record<string, number> = {};

  constructor() {
    super();
    const prisma = this.getDatabaseManager().getClient();
    this.eventRepository = new EventRepository(prisma);
    this.userRepository = new UserRepository(prisma);
  }

  protected getManagerName(): string {
    return 'EventManager';
  }

  protected async onInitialize(): Promise<void> {
    logger.info('EventManager初期化完了');
  }

  /**
   * ユーザーがイベントを選択
   */
  public selectEvent(userId: string, eventId?: number): void {
    if (!eventId) {
      delete this.selectedEvents[userId];
      logger.debug('イベント選択をクリア:', { userId });
    } else {
      this.selectedEvents[userId] = eventId;
      logger.debug('イベントを選択:', { userId, eventId });
    }
  }

  /**
   * ユーザーが選択中のイベントIDを取得
   */
  public getSelectedEventId(userId: string): number | undefined {
    return this.selectedEvents[userId];
  }

  /**
   * Discord イベントIDからイベントを取得
   */
  public async getEventFromDiscordId(
    scheduledEventId: string | undefined,
  ): Promise<OperationResult<EventWithHost | null>> {
    return this.safeExecute(
      async () => {
        this.validateNotEmpty(scheduledEventId, 'scheduledEventId');
        return await this.eventRepository.findByDiscordEventId(scheduledEventId!);
      },
      'Discord イベントID検索',
      { scheduledEventId },
    );
  }

  /**
   * IDからイベントを取得
   */
  public async getEventFromId(
    eventId: number | undefined,
  ): Promise<OperationResult<EventWithHost | null>> {
    return this.safeExecute(
      async () => {
        if (eventId !== undefined) {
          return await this.eventRepository.findById(eventId);
        } else {
          return await this.eventRepository.findLatest();
        }
      },
      'ID検索',
      { eventId },
    );
  }

  /**
   * 最近のイベントを取得
   */
  public async getRecentEvent(
    commandChannel?: TextBasedChannel,
    voiceChannel?: VoiceBasedChannel,
    active = GuildScheduledEventStatus.Active,
  ): Promise<OperationResult<EventWithHost | null>> {
    return this.safeExecute(
      async () => {
        const timeMargin = 3 * 60 * 60 * 1000; // 3時間

        // コマンドを打ったVCチャンネルで開催中のイベントを取得
        if (commandChannel?.isVoiceBased()) {
          const event = await this.eventRepository.findRecentEvent({
            channelId: commandChannel.id,
            active,
            timeMargin,
          });
          if (event) return event;
        }

        // 入っているVCで開催中のイベントを取得
        if (voiceChannel) {
          const event = await this.eventRepository.findRecentEvent({
            channelId: voiceChannel.id,
            active,
            timeMargin,
          });
          if (event) return event;
        }

        // その他で開催中のイベントを取得
        return await this.eventRepository.findRecentEvent({
          active,
          timeMargin,
        });
      },
      '最近のイベント検索',
      {
        commandChannelId: commandChannel?.id,
        voiceChannelId: voiceChannel?.id,
        active,
      },
    );
  }

  /**
   * インタラクションからイベントを取得
   */
  public async getEvent(
    interaction: Interaction,
    active = GuildScheduledEventStatus.Active,
  ): Promise<OperationResult<EventWithHost | null>> {
    return this.safeExecute(
      async () => {
        // 選択されている場合は選択中のイベントを取得
        const selectedEventId = this.selectedEvents[interaction.user.id];
        if (selectedEventId) {
          const result = await this.eventRepository.findById(selectedEventId);
          if (result) return result;
        }

        // 最近のイベントを取得
        const recentResult = await this.getRecentEvent(
          interaction.channel ?? undefined,
          interaction.guild?.members.cache.get(interaction.user.id)?.voice
            .channel ?? undefined,
          active,
        );

        if (recentResult.success && recentResult.data) {
          return recentResult.data;
        }

        // 開催中のイベントが見つからない場合は終了後のイベントを取得
        if (active === GuildScheduledEventStatus.Active) {
          const completedResult = await this.getRecentEvent(
            interaction.channel ?? undefined,
            interaction.guild?.members.cache.get(interaction.user.id)?.voice
              .channel ?? undefined,
            GuildScheduledEventStatus.Completed,
          );

          if (completedResult.success) {
            return completedResult.data;
          }
        }

        return null;
      },
      'インタラクションからイベント取得',
      { userId: interaction.user.id, active },
    );
  }

  /**
   * EventからDiscordのScheduleEventを取得
   */
  public async getScheduleEvent(
    interaction: Interaction,
    event: EventWithHost | null,
  ): Promise<GuildScheduledEvent | undefined> {
    if (!event) {
      return undefined;
    }

    try {
      return await interaction.guild?.scheduledEvents
        .fetch(event.eventId)
        .catch(() => undefined);
    } catch (error) {
      logger.error('ScheduleEvent取得エラー:', { eventId: event.eventId, error });
      return undefined;
    }
  }

  /**
   * イベントを作成
   */
  public async createEvent(
    eventData: EventCreateData,
  ): Promise<OperationResult<EventWithHost>> {
    return this.safeExecute(
      async () => {
        this.validateNotEmpty(eventData.eventId, 'eventId');
        this.validateNotEmpty(eventData.name, 'name');
        this.validateNotEmpty(eventData.channelId, 'channelId');

        const event = await this.eventRepository.create(eventData);
        return await this.eventRepository.findById(event.id);
      },
      'イベント作成',
      eventData,
    );
  }

  /**
   * イベントを更新
   */
  public async updateEvent(
    eventId: number,
    updateData: EventUpdateData,
  ): Promise<OperationResult<EventWithHost>> {
    return this.safeExecute(
      async () => {
        this.validateRequired(eventId, 'eventId');
        
        const event = await this.eventRepository.update(eventId, updateData);
        return await this.eventRepository.findById(event.id);
      },
      'イベント更新',
      { eventId, updateData },
    );
  }

  /**
   * イベントの状態を更新
   */
  public async updateEventStatus(
    eventId: number,
    status: GuildScheduledEventStatus,
    updateData?: {
      startTime?: Date;
      endTime?: Date;
    },
  ): Promise<OperationResult<EventWithHost>> {
    return this.safeExecute(
      async () => {
        const event = await this.eventRepository.updateEventStatus(
          eventId,
          status,
          updateData,
        );
        return await this.eventRepository.findById(event.id);
      },
      'イベント状態更新',
      { eventId, status, updateData },
    );
  }

  /**
   * イベントを検索
   */
  public async searchEvents(
    options: EventSearchOptions,
  ): Promise<OperationResult<EventWithHost[]>> {
    return this.safeExecute(
      async () => {
        return await this.eventRepository.searchEvents(options);
      },
      'イベント検索',
      options,
    );
  }

  /**
   * イベントの統計情報を取得
   */
  public async getEventStatistics(
    eventId: number,
  ): Promise<OperationResult<EventStatistics>> {
    return this.safeExecute(
      async () => {
        this.validateRequired(eventId, 'eventId');
        return await this.eventRepository.getEventStatistics(eventId);
      },
      'イベント統計取得',
      { eventId },
    );
  }

  /**
   * 統計情報付きでイベントを取得
   */
  public async getEventWithStats(
    eventId: number,
  ): Promise<OperationResult<EventWithStats | null>> {
    return this.safeExecute(
      async () => {
        return await this.eventRepository.findWithStats(eventId);
      },
      '統計情報付きイベント取得',
      { eventId },
    );
  }

  /**
   * Discord イベントの説明文を更新
   */
  public async updateEventDescription(
    scheduledEvent: GuildScheduledEvent,
    host?: User,
  ): Promise<OperationResult<void>> {
    return this.safeExecute(
      async () => {
        const newDescription = this.formatEventDescription(
          scheduledEvent.description,
          host,
        );

        if (scheduledEvent.description !== newDescription) {
          await scheduledEvent.edit({
            description: newDescription,
          });
          logger.info('イベントの説明文を更新:', { eventId: scheduledEvent.id });
        }
      },
      'イベント説明文更新',
      { eventId: scheduledEvent.id, hostId: host?.id },
    );
  }

  /**
   * イベントの説明文を加工
   */
  public formatEventDescription(description: string | null, host?: User): string {
    const lines = (description ?? '').split('\n');

    // 後方互換性のため、最後の行に「主催」という文字があれば削除
    if (lines.length > 1 && lines[lines.length - 1].includes('主催')) {
      lines.pop();
    }

    // 先頭の行から既存の主催者情報を削除
    if (lines.length > 0) {
      lines[0] = lines[0].replace(/^≪.*?主催≫\s*/, '');
    }

    // 主催者の文言を先頭の行に統合
    if (host) {
      const hostName = this.userRepository.getUserDisplayName(host);
      if (lines.length > 0) {
        lines[0] = `≪${hostName}主催≫ ${lines[0]}`;
      } else {
        lines.push(`≪${hostName}主催≫`);
      }
    }

    return lines.join('\n');
  }

  /**
   * パフォーマンス統計を取得
   */
  protected async onGetPerformanceStats(): Promise<Record<string, unknown>> {
    const selectedEventsCount = Object.keys(this.selectedEvents).length;
    
    return {
      selectedEventsCount,
      selectedEvents: this.selectedEvents,
    };
  }
}

// シングルトンインスタンスをエクスポート
export const eventManager = new EventManager();