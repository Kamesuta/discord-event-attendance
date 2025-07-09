import { prisma } from '../utils/prisma.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/log.js';
import { User } from '@prisma/client';

/**
 * 候補者の情報
 */
export interface CandidateInfo {
  /** ユーザー情報 */
  user: User;
  /** 総合スコア */
  score: number;
  /** 最近の参加回数 */
  recentParticipations: number;
  /** 最近の主催回数 */
  recentHostings: number;
  /** 同イベントタイプの参加回数 */
  eventTypeParticipations: number;
  /** 最後に主催してからの日数（未主催は null） */
  lastHostedDays: number | null;
  /** 選出理由 */
  reason: string;
}

/**
 * ピックアップ設定
 */
export interface PickupOptions {
  /** イベント名 */
  eventName: string;
  /** イベントタイプ */
  eventType: string;
  /** 最大候補者数 */
  maxCandidates: number;
  /** 参加履歴を見る期間（日数） */
  daysPeriod: number;
}

/**
 * 主催者候補ピックアップアルゴリズム
 * 参加履歴とローテーションを考慮して候補者を選出する
 */
export class HostPickupAlgorithm {
  /**
   * 主催者候補をピックアップします
   * @param options ピックアップ設定
   * @returns 候補者一覧（優先順）
   */
  async pickupCandidates(options: PickupOptions): Promise<CandidateInfo[]> {
    try {
      logger.info(`主催者候補ピックアップ開始: ${options.eventName}`);

      // 1. 最近の参加者を取得
      const recentParticipants = await this._getRecentParticipants(
        options.eventType,
        options.daysPeriod,
      );

      // 2. 各候補者のスコアを計算
      const candidates = await Promise.all(
        recentParticipants.map(async (user) => {
          return await this._calculateCandidateScore(user, options);
        }),
      );

      // 3. スコアでソートして上位を選出
      const sortedCandidates = candidates
        .sort((a, b) => b.score - a.score)
        .slice(0, options.maxCandidates);

      logger.info(
        `主催者候補ピックアップ完了: ${sortedCandidates.length}人選出`,
      );

      return sortedCandidates;
    } catch (error) {
      logger.error('主催者候補ピックアップでエラー:', error);
      throw error;
    }
  }

  /**
   * 最近の参加者を取得
   * @param eventType イベントタイプ
   * @param daysPeriod 期間（日数）
   * @returns 参加者一覧
   */
  private async _getRecentParticipants(
    eventType: string,
    daysPeriod: number,
  ): Promise<User[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysPeriod);

    // 指定期間内のイベントタイプの参加者を取得
    const participants = await prisma.user.findMany({
      where: {
        stats: {
          some: {
            event: {
              name: {
                contains: eventType,
              },
              startTime: {
                gte: cutoffDate,
              },
            },
            duration: {
              gt: config.required_time * 60, // 必要時間以上参加
            },
          },
        },
      },
      distinct: ['id'],
    });

    return participants;
  }

  /**
   * 候補者のスコアを計算
   * @param user ユーザー
   * @param options ピックアップ設定
   * @returns 候補者情報
   */
  private async _calculateCandidateScore(
    user: User,
    options: PickupOptions,
  ): Promise<CandidateInfo> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - options.daysPeriod);

    // 最近の参加回数を取得
    const recentParticipations = await this._getRecentParticipations(
      user.id,
      cutoffDate,
    );

    // 最近の主催回数を取得
    const recentHostings = await this._getRecentHostings(user.id, cutoffDate);

    // 同じイベントタイプの参加回数を取得
    const eventTypeParticipations = await this._getEventTypeParticipations(
      user.id,
      options.eventType,
      cutoffDate,
    );

    // 最後に主催してからの日数を取得
    const lastHostedDays = await this._getLastHostedDays(user.id);

    // スコア計算
    let score = 0;
    let reason = '';

    // 1. イベントタイプ参加度 (0-40点)
    const participationScore = Math.min(eventTypeParticipations * 10, 40);
    score += participationScore;

    // 2. ローテーション考慮 (0-50点)
    let rotationScore = 0;
    if (lastHostedDays === null) {
      // 未主催者は高ポイント
      rotationScore = 50;
      reason = '新人候補';
    } else if (lastHostedDays > 30) {
      // 1ヶ月以上主催していない場合は高ポイント
      rotationScore = 40;
      reason = 'ローテーション候補';
    } else if (lastHostedDays > 14) {
      // 2週間以上の場合は中ポイント
      rotationScore = 25;
      reason = '通常候補';
    } else {
      // 最近主催した場合は低ポイント
      rotationScore = 10;
      reason = '最近主催済み';
    }
    score += rotationScore;

    // 3. 活発度 (0-10点)
    const activityScore = Math.min(recentParticipations * 2, 10);
    score += activityScore;

    // 4. 主催頻度調整 (-20 - 0点)
    // 最近よく主催している場合はマイナス
    const hostingPenalty = Math.max(recentHostings * -5, -20);
    score += hostingPenalty;

    return {
      user,
      score,
      recentParticipations,
      recentHostings,
      eventTypeParticipations,
      lastHostedDays,
      reason,
    };
  }

  /**
   * 最近の参加回数を取得
   * @param userId ユーザーID
   * @param cutoffDate 期間開始日
   * @returns 参加回数
   */
  private async _getRecentParticipations(
    userId: number,
    cutoffDate: Date,
  ): Promise<number> {
    return await prisma.userStat.count({
      where: {
        userId,
        event: {
          startTime: {
            gte: cutoffDate,
          },
        },
        duration: {
          gt: config.required_time * 60,
        },
      },
    });
  }

  /**
   * 最近の主催回数を取得
   * @param userId ユーザーID
   * @param cutoffDate 期間開始日
   * @returns 主催回数
   */
  private async _getRecentHostings(
    userId: number,
    cutoffDate: Date,
  ): Promise<number> {
    return await prisma.event.count({
      where: {
        hostId: userId,
        startTime: {
          gte: cutoffDate,
        },
      },
    });
  }

  /**
   * 特定イベントタイプの参加回数を取得
   * @param userId ユーザーID
   * @param eventType イベントタイプ
   * @param cutoffDate 期間開始日
   * @returns 参加回数
   */
  private async _getEventTypeParticipations(
    userId: number,
    eventType: string,
    cutoffDate: Date,
  ): Promise<number> {
    return await prisma.userStat.count({
      where: {
        userId,
        event: {
          name: {
            contains: eventType,
          },
          startTime: {
            gte: cutoffDate,
          },
        },
        duration: {
          gt: config.required_time * 60,
        },
      },
    });
  }

  /**
   * 最後に主催してからの日数を取得
   * @param userId ユーザーID
   * @returns 日数（未主催は null）
   */
  private async _getLastHostedDays(userId: number): Promise<number | null> {
    const lastEvent = await prisma.event.findFirst({
      where: {
        hostId: userId,
      },
      orderBy: {
        startTime: 'desc',
      },
    });

    if (!lastEvent?.startTime) {
      return null;
    }

    const now = new Date();
    const diffTime = now.getTime() - lastEvent.startTime.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * イベント名からイベントタイプを推定
   * @param eventName イベント名
   * @returns イベントタイプ
   */
  getEventType(eventName: string): string {
    // 絵文字設定を利用してイベントタイプを判定
    for (const [type] of Object.entries(config.emojis)) {
      if (eventName.includes(type)) {
        return type;
      }
    }

    // キーワードから推定
    const keywords = {
      マイクラ: 'マイクラ',
      minecraft: 'マイクラ',
      スプラ: 'スプラ',
      splatoon: 'スプラ',
      ボードゲーム: 'ボードゲーム',
      bga: 'ボードゲーム',
      among: 'Among',
      gartic: 'Gartic',
      マリオ: 'マリオ',
      オーバー: 'Overwatch',
      overwatch: 'Overwatch',
      valorant: 'VALORANT',
      ヴァロ: 'VALORANT',
    };

    for (const [keyword, type] of Object.entries(keywords)) {
      if (eventName.includes(keyword)) {
        return type;
      }
    }

    // デフォルトは「その他」
    return 'その他';
  }

  /**
   * ピックアップ結果を人間が読める形式に変換
   * @param candidates 候補者一覧
   * @returns 可読形式の文字列
   */
  formatCandidatesInfo(candidates: CandidateInfo[]): string {
    return candidates
      .map((candidate, index) => {
        const lastHostText =
          candidate.lastHostedDays !== null
            ? `${candidate.lastHostedDays}日前`
            : '未主催';

        return (
          `${index + 1}. **${candidate.user.memberName || candidate.user.username}** (スコア: ${candidate.score})\n` +
          `   └ ${candidate.reason} | 最終主催: ${lastHostText} | イベント参加: ${candidate.eventTypeParticipations}回`
        );
      })
      .join('\n\n');
  }
}

/**
 * HostPickupAlgorithmのシングルトンインスタンス
 */
export const hostPickupAlgorithm = new HostPickupAlgorithm();

export default hostPickupAlgorithm;
