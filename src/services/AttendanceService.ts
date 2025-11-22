import { Event, User } from '@/generated/prisma/client';
import { prisma } from '@/utils/prisma';

/**
 * 出席時間を管理するサービス
 */
export class AttendanceService {
  /**
   * ユーザーの参加時間を計算する
   * @param eventId イベントのDB ID
   * @param userId ユーザーのID
   * @param endTime イベントの終了時間
   * @returns 参加時間の集計結果
   */
  async calculateAttendanceTime(
    eventId: number,
    userId: number,
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
    return this._calculateTime(logs, endTime);
  }

  /**
   * ログから参加時間を計算する
   * @param logs ボイスログ
   * @param endTime イベントの終了時間
   * @returns 参加時間（ミリ秒）
   */
  private _calculateTime(
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
   * @param user ユーザー
   * @param endTime イベントの終了時間
   */
  async tallyAttendanceTime(
    eventId: number,
    user: User,
    endTime: Date,
  ): Promise<void> {
    const totalTime = await this.calculateAttendanceTime(
      eventId,
      user.id,
      endTime,
    );

    // 集計結果をDBに保存する
    await prisma.userStat.upsert({
      where: {
        id: {
          eventId,
          userId: user.id,
        },
      },
      update: {
        duration: totalTime,
      },
      create: {
        eventId,
        userId: user.id,
        duration: totalTime,
      },
    });
  }

  /**
   * 参加時間を集計し、DBに保存する
   * @param event イベント
   * @param endTime イベントの終了時間
   */
  async updateAttendanceTime(event: Event, endTime: Date): Promise<void> {
    // アクティブなイベントに参加しているユーザーを取得する
    const userStats = await prisma.userStat.findMany({
      where: {
        eventId: event.id,
      },
      include: {
        user: true,
      },
    });

    for (const userStat of userStats) {
      await this.tallyAttendanceTime(event.id, userStat.user, endTime);
    }
  }
}

/**
 * 出席時間管理サービスのインスタンス
 */
export const attendanceService = new AttendanceService();
