import { Event, PrismaClient } from '@prisma/client';
import {
  GuildScheduledEvent,
  GuildScheduledEventStatus,
  PartialGuildScheduledEvent,
  VoiceBasedChannel,
} from 'discord.js';
import { config } from './utils/config.js';
import { tallyAttendanceTime } from './event/attendance_time.js';
import { logger } from './utils/log.js';
import eventManager from './event/EventManager.js';

const prisma = new PrismaClient();

/**
 * イベントのカバー画像のサイズ
 */
const coverImageSize = 2048;

/**
 * スケジュールイベントが作成されたときのイベントハンドラー
 * @param scheduledEvent 作成されたイベント
 * @returns 作成されたイベント
 */
export async function onCreateScheduledEvent(
  scheduledEvent: GuildScheduledEvent,
): Promise<Event | undefined> {
  if (!scheduledEvent.channel?.isVoiceBased()) {
    logger.warn(
      `VCが指定されていないイベントは無視します: ${scheduledEvent.name}`,
    );
    return;
  }

  try {
    const event = await prisma.event.create({
      data: {
        eventId: scheduledEvent.id,

        active: scheduledEvent.status,

        name: scheduledEvent.name,
        channelId: scheduledEvent.channel.id,
        description: scheduledEvent.description,
        coverImage: scheduledEvent.coverImageURL({ size: coverImageSize }),
        scheduleTime: scheduledEvent.scheduledStartAt,
      },
    });
    logger.info(
      `イベントを作成しました: ID=${event.id}, Name=${scheduledEvent.name}`,
    );
    return event;
  } catch (error) {
    logger.error('イベントの作成に失敗しました:', error);
  }
}

/**
 * スケジュールイベントが開始されたときのイベントハンドラー
 * @param scheduledEvent 開始されたイベント
 * @returns 開始されたイベント
 */
export async function onStartScheduledEvent(
  scheduledEvent: GuildScheduledEvent,
): Promise<Event | undefined> {
  if (!scheduledEvent.channel?.isVoiceBased()) {
    logger.warn(
      `VCが指定されていないイベントは無視します: ${scheduledEvent.name}`,
    );
    return;
  }

  try {
    // イベント情報を取得
    let event = await eventManager.getEventFromDiscordId(scheduledEvent.id);
    if (!event) {
      event = await prisma.event.create({
        data: {
          eventId: scheduledEvent.id,

          active: GuildScheduledEventStatus.Active,
          startTime: new Date(),

          name: scheduledEvent.name,
          channelId: scheduledEvent.channel.id,
          description: scheduledEvent.description,
          coverImage: scheduledEvent.coverImageURL({ size: coverImageSize }),
          scheduleTime: scheduledEvent.scheduledStartAt,
        },
      });
    } else {
      event = await prisma.event.update({
        where: {
          id: event.id,
        },
        data: {
          active: GuildScheduledEventStatus.Active,
          startTime: new Date(),

          name: scheduledEvent.name,
          channelId: scheduledEvent.channel.id,
          description: scheduledEvent.description,
          coverImage: scheduledEvent.coverImageURL({ size: coverImageSize }),
          scheduleTime: scheduledEvent.scheduledStartAt,
        },
      });
    }
    logger.info(
      `イベントを開始しました: ID=${event.id}, Name=${scheduledEvent.name}`,
    );

    // VCに既に参加しているユーザーに対してもログを記録する
    const members = Array.from(scheduledEvent.channel.members.values());
    // ユーザー情報を初期化
    await prisma.userStat.createMany({
      data: members.map((member) => ({
        eventId: event.id,
        userId: member.id,
        duration: 0,
      })),
    });
    // VC参加ログを記録する
    await prisma.voiceLog.createMany({
      data: members.map((member) => ({
        eventId: event.id,
        userId: member.id,
        join: true,
      })),
    });

    return event;
  } catch (error) {
    logger.error('イベントの開始に失敗しました:', error);
  }
}

/**
 * イベント情報をDiscord側から取得して更新する
 * @param scheduledEvent イベント
 */
export async function onUpdateScheduledEvent(
  scheduledEvent: GuildScheduledEvent,
): Promise<void> {
  if (!scheduledEvent.channel?.isVoiceBased()) {
    logger.warn(
      `VCが指定されていないイベントは無視します: ${scheduledEvent.name}`,
    );
    return;
  }

  // イベント情報を取得
  const event = await eventManager.getEventFromDiscordId(scheduledEvent.id);
  if (!event) {
    logger.warn(
      `イベント情報の更新に失敗しました: イベントが見つかりません: Name=${scheduledEvent.name}`,
    );
    return;
  }

  try {
    await prisma.event.update({
      where: {
        id: event.id,
      },
      data: {
        active: scheduledEvent.status,

        name: scheduledEvent.name,
        channelId: scheduledEvent.channel.id,
        description: scheduledEvent.description,
        coverImage: scheduledEvent.coverImageURL({ size: coverImageSize }),
        scheduleTime: scheduledEvent.scheduledStartAt,
      },
    });
    logger.info(`イベント情報を更新しました: Name=${scheduledEvent.name}`);
  } catch (error) {
    logger.error('イベント情報の更新に失敗しました:', error);
  }
}

/**
 * スケジュールイベントが終了されたときのイベントハンドラー
 * @param scheduledEvent 終了されたイベント
 * @returns 終了されたイベント
 */
export async function onEndScheduledEvent(
  scheduledEvent: GuildScheduledEvent | PartialGuildScheduledEvent,
): Promise<void> {
  try {
    const event = await eventManager.getEventFromDiscordId(scheduledEvent.id);
    if (!event) {
      logger.warn(`イベントが見つかりません: Name=${scheduledEvent.name}`);
      return;
    }
    await onEndEvent(event, scheduledEvent.channel ?? undefined);
    logger.info(`イベントを終了しました: Name=${scheduledEvent.name}`);
  } catch (error) {
    logger.error('イベントの終了に失敗しました:', error);
  }
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
  // データベースを更新
  await prisma.event.update({
    where: {
      id: event.id,
    },
    data: {
      active: GuildScheduledEventStatus.Completed,
      endTime: new Date(),
    },
  });

  if (channel) {
    // VCに参加しているユーザーに対してもログを記録する
    for (const [_, member] of channel.members) {
      await prisma.voiceLog.create({
        data: {
          eventId: event.id,
          userId: member.id,
          join: false,
        },
      });
      // 参加時間を集計する
      await tallyAttendanceTime(event.id, member.id, new Date());
    }
  }
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

    // イベント情報を更新
    if (!oldScheduledEvent.partial) {
      await onUpdateScheduledEvent(oldScheduledEvent);
    }

    // イベント情報取得
    const event = await eventManager.getEventFromDiscordId(
      oldScheduledEvent.id,
    );
    if (!event) {
      logger.warn(`イベントが見つかりません: Name=${oldScheduledEvent.name}`);
      return;
    }

    // イベントのキャンセル処理
    await prisma.event.update({
      where: {
        id: event.id,
      },
      data: {
        active: GuildScheduledEventStatus.Canceled,
      },
    });
  } catch (error) {
    logger.error(
      'onGuildScheduledEventUpdate中にエラーが発生しました。',
      error,
    );
  }
}
