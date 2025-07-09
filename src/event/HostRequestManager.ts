import { HostRequest, User, Event } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/log.js';

/**
 * お伺いリクエストの状態
 */
export type HostRequestStatus = 'pending' | 'accepted' | 'declined' | 'expired';

/**
 * HostRequestとリレーション情報を含む型
 */
export type HostRequestWithRelations = HostRequest & {
  event: Event;
  user: User;
};

/**
 * お伺い管理の中核クラス
 * 主催者へのお伺いリクエストの作成・管理・状態更新を担当
 */
export class HostRequestManager {
  /**
   * お伺いリクエストを作成します
   * @param eventId イベントID
   * @param userId ユーザーID
   * @param priority 依頼順（1番手、2番手...）
   * @param customMessage カスタム依頼メッセージ
   * @returns 作成されたお伺いリクエスト
   */
  async createRequest(
    eventId: number,
    userId: number,
    priority: number,
    customMessage?: string,
  ): Promise<HostRequestWithRelations> {
    try {
      // 期限を設定（現在時刻 + 設定されたタイムアウト時間）
      const expiresAt = new Date();
      expiresAt.setHours(
        expiresAt.getHours() + config.host_request_timeout_hours,
      );

      const hostRequest = await prisma.hostRequest.create({
        data: {
          eventId,
          userId,
          priority,
          status: 'pending',
          message: customMessage,
          expiresAt,
        },
        include: {
          event: true,
          user: true,
        },
      });

      logger.info(
        `お伺いリクエストを作成しました: Event=${eventId}, User=${userId}, Priority=${priority}`,
      );

      return hostRequest;
    } catch (error) {
      logger.error('お伺いリクエストの作成に失敗しました:', error);
      throw error;
    }
  }

  /**
   * お伺いリクエストを取得します
   * @param id お伺いリクエストID
   * @returns お伺いリクエスト
   */
  async getRequest(id: number): Promise<HostRequestWithRelations | null> {
    try {
      return await prisma.hostRequest.findUnique({
        where: { id },
        include: {
          event: true,
          user: true,
        },
      });
    } catch (error) {
      logger.error('お伺いリクエストの取得に失敗しました:', error);
      throw error;
    }
  }

  /**
   * イベントのお伺いリクエスト一覧を取得します
   * @param eventId イベントID
   * @param status 状態でフィルタ（省略時は全て）
   * @returns お伺いリクエスト一覧
   */
  async getRequestsByEvent(
    eventId: number,
    status?: HostRequestStatus,
  ): Promise<HostRequestWithRelations[]> {
    try {
      return await prisma.hostRequest.findMany({
        where: {
          eventId,
          ...(status && { status }),
        },
        include: {
          event: true,
          user: true,
        },
        orderBy: {
          priority: 'asc',
        },
      });
    } catch (error) {
      logger.error('イベントのお伺いリクエスト取得に失敗しました:', error);
      throw error;
    }
  }

  /**
   * ユーザーのお伺いリクエスト一覧を取得します
   * @param userId ユーザーID
   * @param status 状態でフィルタ（省略時は全て）
   * @returns お伺いリクエスト一覧
   */
  async getRequestsByUser(
    userId: number,
    status?: HostRequestStatus,
  ): Promise<HostRequestWithRelations[]> {
    try {
      return await prisma.hostRequest.findMany({
        where: {
          userId,
          ...(status && { status }),
        },
        include: {
          event: true,
          user: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    } catch (error) {
      logger.error('ユーザーのお伺いリクエスト取得に失敗しました:', error);
      throw error;
    }
  }

  /**
   * お伺いリクエストの状態を更新します
   * @param id お伺いリクエストID
   * @param status 新しい状態
   * @param dmMessageId DMメッセージID（DMを送信した場合）
   * @returns 更新されたお伺いリクエスト
   */
  async updateRequestStatus(
    id: number,
    status: HostRequestStatus,
    dmMessageId?: string,
  ): Promise<HostRequestWithRelations> {
    try {
      const updateData: { status: HostRequestStatus; dmMessageId?: string } = {
        status,
      };
      if (dmMessageId) {
        updateData.dmMessageId = dmMessageId;
      }

      const hostRequest = await prisma.hostRequest.update({
        where: { id },
        data: updateData,
        include: {
          event: true,
          user: true,
        },
      });

      logger.info(
        `お伺いリクエストの状態を更新しました: ID=${id}, Status=${status}`,
      );

      return hostRequest;
    } catch (error) {
      logger.error('お伺いリクエスト状態の更新に失敗しました:', error);
      throw error;
    }
  }

  /**
   * 期限切れのお伺いリクエストを自動で期限切れ状態に更新します
   * @returns 更新された件数
   */
  async expireOverdueRequests(): Promise<number> {
    try {
      const now = new Date();
      const result = await prisma.hostRequest.updateMany({
        where: {
          status: 'pending',
          expiresAt: {
            lt: now,
          },
        },
        data: {
          status: 'expired',
        },
      });

      if (result.count > 0) {
        logger.info(
          `期限切れのお伺いリクエストを${result.count}件更新しました`,
        );
      }

      return result.count;
    } catch (error) {
      logger.error('期限切れお伺いリクエストの更新に失敗しました:', error);
      throw error;
    }
  }

  /**
   * お伺いリクエストを削除します
   * @param id お伺いリクエストID
   */
  async deleteRequest(id: number): Promise<void> {
    try {
      await prisma.hostRequest.delete({
        where: { id },
      });

      logger.info(`お伺いリクエストを削除しました: ID=${id}`);
    } catch (error) {
      logger.error('お伺いリクエストの削除に失敗しました:', error);
      throw error;
    }
  }

  /**
   * イベントの全お伺いリクエストを削除します
   * @param eventId イベントID
   */
  async deleteRequestsByEvent(eventId: number): Promise<void> {
    try {
      const result = await prisma.hostRequest.deleteMany({
        where: { eventId },
      });

      logger.info(
        `イベント${eventId}のお伺いリクエストを${result.count}件削除しました`,
      );
    } catch (error) {
      logger.error('イベントのお伺いリクエスト削除に失敗しました:', error);
      throw error;
    }
  }

  /**
   * DMメッセージIDからお伺いリクエストを取得します
   * @param dmMessageId DMメッセージID
   * @returns お伺いリクエスト
   */
  async getRequestByDmMessageId(
    dmMessageId: string,
  ): Promise<HostRequestWithRelations | null> {
    try {
      return await prisma.hostRequest.findFirst({
        where: { dmMessageId },
        include: {
          event: true,
          user: true,
        },
      });
    } catch (error) {
      logger.error(
        'DMメッセージIDからのお伺いリクエスト取得に失敗しました:',
        error,
      );
      throw error;
    }
  }

  /**
   * お伺いリクエストが期限切れかどうかチェックします
   * @param hostRequest お伺いリクエスト
   * @returns 期限切れかどうか
   */
  isExpired(hostRequest: HostRequest): boolean {
    return new Date() > hostRequest.expiresAt;
  }

  /**
   * お伺いリクエストの残り時間を取得します（分単位）
   * @param hostRequest お伺いリクエスト
   * @returns 残り時間（分）。負数の場合は期限切れ
   */
  getRemainingTimeMinutes(hostRequest: HostRequest): number {
    const now = new Date();
    const remaining = hostRequest.expiresAt.getTime() - now.getTime();
    return Math.floor(remaining / (1000 * 60));
  }
}

/**
 * HostRequestManagerのシングルトンインスタンス
 */
export const hostRequestManager = new HostRequestManager();

export default hostRequestManager;
