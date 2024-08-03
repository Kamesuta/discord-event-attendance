import { Event } from '@prisma/client';
import { prisma } from '../index.js';

/**
 * ユーザーの参加時間を計算する
 * @param eventId イベントのDB ID
 * @param userId ユーザーのID
 * @param endTime イベントの終了時間
 * @returns 参加時間の集計結果
 */
export async function calculateAttendanceTime(
  eventId: number,
  userId: string,
  endTime: Date,
): Promise<number> {
  const logs = await prisma.voiceLog.findMany({
    where: {
      eventId,
      userId,
    },
    orderBy: {
      timestamp: 'asc',
    },
  });

  // ユーザーのログを取得する
  return calculateTime(logs, endTime);
}

function calculateTime(
  logs: { timestamp: Date; join: boolean }[],
  endTime: Date,
): number {
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
  if (joinTime !== null) {
    // 参加中の場合
    totalTime += endTime.getTime() - joinTime;
  }
  return totalTime;
}

/**
 * 参加時間を集計し、DBに保存する
 * @param eventId イベントのDB ID
 * @param userId ユーザーのID
 * @param endTime イベントの終了時間
 */
export async function tallyAttendanceTime(
  eventId: number,
  userId: string,
  endTime: Date,
): Promise<void> {
  const totalTime = await calculateAttendanceTime(eventId, userId, endTime);

  // 集計結果をDBに保存する
  await prisma.userStat.upsert({
    where: {
      id: {
        eventId,
        userId,
      },
    },
    update: {
      duration: totalTime,
    },
    create: {
      eventId,
      userId,
      duration: totalTime,
    },
  });
}

/**
 * 参加時間を集計し、DBに保存する
 * @param event イベント
 * @param endTime イベントの終了時間
 */
export async function updateAttendanceTime(
  event: Event,
  endTime: Date,
): Promise<void> {
  // アクティブなイベントに参加しているユーザーを取得する
  const userStats = await prisma.voiceLog.findMany({
    where: {
      eventId: event.id,
    },
  });
  const participants = new Set(userStats.map((user) => user.userId));

  for (const userId of participants) {
    await tallyAttendanceTime(event.id, userId, endTime);
  }
}
