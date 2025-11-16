import { Event, User } from '@prisma/client';
import {
  GuildScheduledEvent,
  GuildScheduledEventStatus,
  PartialGuildScheduledEvent,
  VoiceBasedChannel,
} from 'discord.js';
import { config } from './utils/config.js';
import { logger } from './utils/log.js';
import { EventWithHost } from './event/EventManager.js';
import { eventLifecycleService } from './services/EventLifecycleService.js';
import { eventSchedulerService } from './services/EventSchedulerService.js';
import { client } from './utils/client.js';

/**
 * スケジュールイベントが作成されたときのイベントハンドラー
 * @param scheduledEvent 作成されたイベント
 * @param host 主催者
 * @returns 作成されたイベント
 */
export async function onCreateScheduledEvent(
  scheduledEvent: GuildScheduledEvent,
  host?: User,
): Promise<EventWithHost | undefined> {
  const result = await eventLifecycleService.onCreateScheduledEvent(
    scheduledEvent,
    host,
  );

  // スケジュールを更新
  await updateSchedules();

  return result;
}

/**
 * スケジュールイベントが開始されたときのイベントハンドラー
 * @param scheduledEvent 開始されたイベント
 * @returns 開始されたイベント
 */
export async function onStartScheduledEvent(
  scheduledEvent: GuildScheduledEvent,
): Promise<Event | undefined> {
  const result =
    await eventLifecycleService.onStartScheduledEvent(scheduledEvent);

  // スケジュールを更新
  await updateSchedules();

  return result;
}

/**
 * イベント情報をDiscord側から取得して更新する
 * @param scheduledEvent イベント
 */
export async function onUpdateScheduledEvent(
  scheduledEvent: GuildScheduledEvent,
): Promise<void> {
  await eventLifecycleService.onUpdateScheduledEvent(scheduledEvent);

  // スケジュールを更新
  await updateSchedules();
}

/**
 * スケジュールイベントが終了されたときのイベントハンドラー
 * @param scheduledEvent 終了されたイベント
 * @returns 終了されたイベント
 */
export async function onEndScheduledEvent(
  scheduledEvent: GuildScheduledEvent | PartialGuildScheduledEvent,
): Promise<void> {
  await eventLifecycleService.onEndScheduledEvent(scheduledEvent);

  // スケジュールを更新
  await updateSchedules();
}

/**
 * イベントを終了する
 * @param event 終了されたイベント
 * @param channel VCチャンネル
 * @returns 終了されたイベント
 */
export async function onEndEvent(
  event: Event,
  channel?: VoiceBasedChannel,
): Promise<void> {
  await eventLifecycleService.onEndEvent(event, channel);

  // スケジュールを更新
  await updateSchedules();
}

/**
 * スケジュールイベントが作成されたときのイベントハンドラー
 * @param scheduledEvent 作成されたイベント
 */
export async function onGuildScheduledEventCreate(
  scheduledEvent: GuildScheduledEvent,
): Promise<void> {
  try {
    // 指定のサーバー以外無視
    if (scheduledEvent.guild?.id !== config.guild_id) {
      return;
    }

    // イベントBOTの操作を無視
    if (scheduledEvent.creatorId === client.user?.id) {
      return;
    }

    await onCreateScheduledEvent(scheduledEvent);
  } catch (error) {
    logger.error(
      'onGuildScheduledEventCreate中にエラーが発生しました。',
      error,
    );
  }
}

/**
 * スケジュールイベントが更新されたときのイベントハンドラー
 * @param oldScheduledEvent 更新前のイベント
 * @param newScheduledEvent 更新後のイベント
 */
export async function onGuildScheduledEventUpdate(
  oldScheduledEvent: GuildScheduledEvent | PartialGuildScheduledEvent | null,
  newScheduledEvent: GuildScheduledEvent,
): Promise<void> {
  try {
    if (!oldScheduledEvent) return;

    // 指定のサーバー以外無視
    if (newScheduledEvent.guild?.id !== config.guild_id) {
      return;
    }

    if (!oldScheduledEvent.isActive() && newScheduledEvent.isActive()) {
      // イベントの開始処理
      await onStartScheduledEvent(newScheduledEvent);
    } else if (oldScheduledEvent.isActive() && !newScheduledEvent.isActive()) {
      // イベントの終了処理
      await onEndScheduledEvent(newScheduledEvent);
      if (newScheduledEvent.status === GuildScheduledEventStatus.Scheduled) {
        // 繰り返しイベントが終了した場合、Scheduled状態に変更されるため、その場合は新しいイベントを登録する
        await onCreateScheduledEvent(newScheduledEvent);
      }
    }
    // イベント情報を更新
    await onUpdateScheduledEvent(newScheduledEvent);
  } catch (error) {
    logger.error(
      'onGuildScheduledEventUpdate中にエラーが発生しました。',
      error,
    );
  }
}

/**
 * スケジュールイベントが削除されたときのイベントハンドラー
 * @param oldScheduledEvent 更新前のイベント
 */
export async function onGuildScheduledEventDelete(
  oldScheduledEvent: GuildScheduledEvent | PartialGuildScheduledEvent,
): Promise<void> {
  try {
    if (!oldScheduledEvent) return;

    // 指定のサーバー以外無視
    if (oldScheduledEvent.guild?.id !== config.guild_id) {
      return;
    }

    await eventLifecycleService.onGuildScheduledEventDelete(oldScheduledEvent);
  } catch (error) {
    logger.error(
      'onGuildScheduledEventUpdate中にエラーが発生しました。',
      error,
    );
  }
}

/**
 * node-scheduleを使ってパネルを出すスケジュールを更新する
 */
export async function updateSchedules(): Promise<void> {
  await eventSchedulerService.updateSchedules();
}
