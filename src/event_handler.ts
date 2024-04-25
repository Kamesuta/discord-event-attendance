import { PrismaClient } from '@prisma/client';
import { GuildScheduledEvent, PartialGuildScheduledEvent } from 'discord.js';
import { config } from './utils/config.js';
import {
  calculateAttendanceTime,
  tallyAttendanceTime,
} from './attendance_time.js';

const prisma = new PrismaClient();

async function startEvent(scheduledEvent: GuildScheduledEvent): Promise<void> {
  if (!scheduledEvent.channel?.isVoiceBased()) {
    console.warn(
      `VCが指定されていないイベントは無視します: ${scheduledEvent.name}`
    );
    return;
  }

  try {
    const attendance = await prisma.event.create({
      data: {
        name: scheduledEvent.name,
        channelId: scheduledEvent.channel.id,
        eventId: scheduledEvent.id,
      },
    });
    console.log(
      `イベントを開始しました: ID=${attendance.id}, Name=${scheduledEvent.name}`
    );

    // VCに既に参加しているユーザーに対してもログを記録する
    for (const [_, member] of scheduledEvent.channel.members) {
      await prisma.voiceLog.create({
        data: {
          eventId: attendance.id,
          userId: member.id,
          join: true,
        },
      });
    }
  } catch (error) {
    console.error('イベントの開始に失敗しました:', error);
  }
}

async function endEvent(scheduledEvent: GuildScheduledEvent): Promise<void> {
  if (!scheduledEvent.channel?.isVoiceBased()) {
    console.warn(
      `VCが指定されていないイベントは無視します: ${scheduledEvent.name}`
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
 * スケジュールイベントが更新されたときのイベントハンドラー
 * @param oldScheduledEvent 更新前のイベント
 * @param newScheduledEvent 更新後のイベント
 */
export async function onGuildScheduledEventUpdate(
  oldScheduledEvent: GuildScheduledEvent | PartialGuildScheduledEvent | null,
  newScheduledEvent: GuildScheduledEvent
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
      error
    );
  }
}
