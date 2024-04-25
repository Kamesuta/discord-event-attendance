import { prisma } from './index.js';

/**
 * ユーザーの参加時間を計算する
 * @param eventId イベントのDB ID
 * @param userId ユーザーのID
 * @returns 参加時間の集計結果
 */
export async function calculateAttendanceTime(
  eventId: number,
  userId: string
): Promise<number> {
  const logs = await prisma.voiceLog.findMany({
    where: {
      eventId,
      userId,
    },
  });

  // ユーザーのログを取得する
  return calculateTime(logs);
}

function calculateTime(logs: { timestamp: Date; join: boolean }[]): number {
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
  return totalTime;
}

/**
 * 参加時間を集計し、DBに保存する
 * @param eventId イベントのDB ID
 * @param userId ユーザーのID
 */
export async function tallyAttendanceTime(
  eventId: number,
  userId: string
): Promise<void> {
  const totalTime = await calculateAttendanceTime(eventId, userId);

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
