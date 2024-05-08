import { Event, PrismaClient } from '@prisma/client';
import { GuildScheduledEvent, PartialGuildScheduledEvent } from 'discord.js';
import { config } from './utils/config.js';
import { tallyAttendanceTime } from './attendance_time.js';

const prisma = new PrismaClient();

/**
 * イベントのカバー画像のサイズ
 */
const coverImageSize = 2048;

/**
 * スケジュールイベントが作成されたときのイベントハンドラー
 * @param scheduledEvent 作成されたイベント
 */
export async function createEvent(
  scheduledEvent: GuildScheduledEvent,
): Promise<void> {
  if (!scheduledEvent.channel?.isVoiceBased()) {
    console.warn(
      `VCが指定されていないイベントは無視します: ${scheduledEvent.name}`,
    );
    return;
  }

  try {
    await prisma.event.create({
      data: {
        eventId: scheduledEvent.id,

        name: scheduledEvent.name,
        channelId: scheduledEvent.channel.id,
        description: scheduledEvent.description,
        coverImage: scheduledEvent.coverImageURL({ size: coverImageSize }),
      },
    });
    console.log(`イベントを作成しました: Name=${scheduledEvent.name}`);
  } catch (error) {
    console.error('イベントの作成に失敗しました:', error);
  }
}

/**
 * スケジュールイベントが開始されたときのイベントハンドラー
 * @param scheduledEvent 開始されたイベント
 * @returns 開始されたイベント
 */
export async function startEvent(
  scheduledEvent: GuildScheduledEvent,
): Promise<Event | undefined> {
  if (!scheduledEvent.channel?.isVoiceBased()) {
    console.warn(
      `VCが指定されていないイベントは無視します: ${scheduledEvent.name}`,
    );
    return;
  }

  try {
    const attendance = await prisma.event.upsert({
      where: {
        eventId: scheduledEvent.id,
      },
      update: {
        active: true,
        startTime: new Date(),

        name: scheduledEvent.name,
        channelId: scheduledEvent.channel.id,
        description: scheduledEvent.description,
        coverImage: scheduledEvent.coverImageURL({ size: coverImageSize }),
      },
      create: {
        eventId: scheduledEvent.id,

        active: true,
        startTime: new Date(),

        name: scheduledEvent.name,
        channelId: scheduledEvent.channel.id,
        description: scheduledEvent.description,
        coverImage: scheduledEvent.coverImageURL({ size: coverImageSize }),
      },
    });
    console.log(
      `イベントを開始しました: ID=${attendance.id}, Name=${scheduledEvent.name}`,
    );

    // VCに既に参加しているユーザーに対してもログを記録する
    const members = Array.from(scheduledEvent.channel.members.values());
    // ユーザー情報を初期化
    await prisma.userStat.createMany({
      data: members.map((member) => ({
        eventId: attendance.id,
        userId: member.id,
        duration: 0,
      })),
    });
    // VC参加ログを記録する
    await prisma.voiceLog.createMany({
      data: members.map((member) => ({
        eventId: attendance.id,
        userId: member.id,
        join: true,
      })),
    });

    return attendance;
  } catch (error) {
    console.error('イベントの開始に失敗しました:', error);
  }
}

/**
 * イベント情報をDiscord側から取得して更新する
 * @param scheduledEvent イベント
 */
export async function updateEvent(
  scheduledEvent: GuildScheduledEvent,
): Promise<void> {
  if (!scheduledEvent.channel?.isVoiceBased()) {
    console.warn(
      `VCが指定されていないイベントは無視します: ${scheduledEvent.name}`,
    );
    return;
  }

  try {
    await prisma.event.update({
      where: {
        eventId: scheduledEvent.id,
      },
      data: {
        name: scheduledEvent.name,
        channelId: scheduledEvent.channel.id,
        description: scheduledEvent.description,
        coverImage: scheduledEvent.coverImageURL({ size: coverImageSize }),
      },
    });
    console.log(`イベント情報を更新しました: Name=${scheduledEvent.name}`);
  } catch (error) {
    console.error('イベント情報の更新に失敗しました:', error);
  }
}

/**
 * スケジュールイベントが終了されたときのイベントハンドラー
 * @param scheduledEvent 終了されたイベント
 * @returns 終了されたイベント
 */
export async function endEvent(
  scheduledEvent: GuildScheduledEvent,
): Promise<void> {
  if (!scheduledEvent.channel?.isVoiceBased()) {
    console.warn(
      `VCが指定されていないイベントは無視します: ${scheduledEvent.name}`,
    );
    return;
  }

  try {
    const event = await prisma.event.findFirst({
      where: {
        eventId: scheduledEvent.id,
        active: true,
      },
    });
    if (!event) {
      console.warn(`イベントが見つかりません: Name=${scheduledEvent.name}`);
      return;
    }
    await prisma.event.update({
      where: {
        id: event.id,
      },
      data: {
        active: false,
        endTime: new Date(),
      },
    });
    console.log(`イベントを終了しました: Name=${scheduledEvent.name}`);

    // VCに参加しているユーザーに対してもログを記録する
    for (const [_, member] of scheduledEvent.channel.members) {
      await prisma.voiceLog.create({
        data: {
          eventId: event.id,
          userId: member.id,
          join: false,
        },
      });
      // 参加時間を集計する
      await tallyAttendanceTime(event.id, member.id);
    }
  } catch (error) {
    console.error('イベントの終了に失敗しました:', error);
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

    await createEvent(scheduledEvent);
  } catch (error) {
    console.error(
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
      await startEvent(newScheduledEvent);
    } else if (oldScheduledEvent.isActive() && !newScheduledEvent.isActive()) {
      await endEvent(newScheduledEvent);
    }
  } catch (error) {
    console.error(
      'onGuildScheduledEventUpdate中にエラーが発生しました。',
      error,
    );
  }
}
