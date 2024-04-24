import { PrismaClient } from '@prisma/client';
import { GuildScheduledEvent, PartialGuildScheduledEvent } from 'discord.js';
import { config } from './utils/config.js';

const prisma = new PrismaClient();

async function startEvent(event: GuildScheduledEvent): Promise<void> {
  if (!event.channel?.isVoiceBased()) {
    console.warn(`VCが指定されていないイベントは無視します: ${event.name}`);
    return;
  }

  try {
    const attendance = await prisma.event.create({
      data: {
        name: event.name,
        channelId: event.channel.id,
        eventId: event.id,
      },
    });
    console.log(
      `イベントを開始しました: ID=${attendance.id}, Name=${event.name}`
    );

    // VCに既に参加しているユーザーに対してもログを記録する
    for (const [_, member] of event.channel.members) {
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

async function endEvent(event: GuildScheduledEvent): Promise<void> {
  if (!event.channel?.isVoiceBased()) {
    console.warn(`VCが指定されていないイベントは無視します: ${event.name}`);
    return;
  }

  try {
    const attendance = await prisma.event.findFirst({
      where: {
        eventId: event.id,
        active: true,
      },
    });
    if (!attendance) {
      console.warn(`イベントが見つかりません: Name=${event.name}`);
      return;
    }
    await prisma.event.update({
      where: {
        id: attendance.id,
      },
      data: {
        active: false,
        endTime: new Date(),
      },
    });
    console.log(`イベントを終了しました: Name=${event.name}`);

    // VCに参加しているユーザーに対してもログを記録する
    for (const [_, member] of event.channel.members) {
      await prisma.voiceLog.create({
        data: {
          eventId: attendance.id,
          userId: member.id,
          join: false,
        },
      });
    }

    // VC参加ログを集計する
    const voiceLogs = await prisma.voiceLog.findMany({
      where: {
        eventId: attendance.id,
      },
    });
    // イベントの参加者を取得する
    const participants = [...new Set(voiceLogs.map((log) => log.userId))];
    // 参加者ごとに参加時間を集計する
    const attendanceTime = participants.map((userId) => {
      // ユーザーのログを取得する
      const logs = voiceLogs.filter((log) => log.userId === userId);

      // 参加時間を計算する
      let totalTime = 0;
      let joinTime: number | null = null;
      for (let i = 0; i < logs.length; ++i) {
        const log = logs[i];
        if (joinTime === null && log.join) {
          joinTime = log.timestamp.getTime();
        } else if (joinTime !== null && !log.join) {
          totalTime += log.timestamp.getTime() - joinTime;
          joinTime = null;
        }
      }

      return {
        userId,
        totalTime,
      };
    }).filter((data) => 
      // 必要接続分数を満たしているユーザーのみを抽出する (config.required_time分以上参加している)
      data.totalTime >= config.required_time * 60 * 1000
    );

    // 集計結果をDBに保存する
    for (const { userId, totalTime } of attendanceTime) {
      await prisma.userStat.upsert({
        where: {
          id: {
            eventId: attendance.id,
            userId,
          },
        },
        update: {
          duration: totalTime,
        },
        create: {
          eventId: attendance.id,
          userId,
          duration: totalTime,
        },
      });
    }
  } catch (error) {
    console.error('イベントの終了に失敗しました:', error);
  }
}

/**
 * スケジュールイベントが更新されたときのイベントハンドラー
 * @param oldEvent 更新前のイベント
 * @param newEvent 更新後のイベント
 */
export async function onGuildScheduledEventUpdate(
  oldEvent: GuildScheduledEvent | PartialGuildScheduledEvent | null,
  newEvent: GuildScheduledEvent
): Promise<void> {
  if (!oldEvent) return;

  // 指定のサーバー以外無視
  if (newEvent.guild?.id !== config.guild_id) {
    return;
  }

  if (!oldEvent.isActive() && newEvent.isActive()) {
    await startEvent(newEvent);
  } else if (oldEvent.isActive() && !newEvent.isActive()) {
    await endEvent(newEvent);
  }
}
