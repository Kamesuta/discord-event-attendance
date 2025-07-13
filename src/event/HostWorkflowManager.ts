import { HostWorkflow, Event, HostRequest } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/log.js';
import {
  HostRequestManager,
  HostRequestWithRelations,
  hostRequestManager,
} from './HostRequestManager.js';

/**
 * HostWorkflowとリレーション情報を含む型
 */
export type HostWorkflowWithRelations = HostWorkflow & {
  event: Event;
  requests: HostRequest[];
};

/**
 * ワークフロー管理の中核クラス
 * 主催者お伺いワークフロー全体の管理を担当
 */
export class HostWorkflowManager {
  private _hostRequestManager: HostRequestManager;

  /**
   * HostWorkflowManagerのコンストラクタ
   * @param hostRequestManager HostRequestManagerインスタンス
   */
  constructor(hostRequestManager: HostRequestManager) {
    this._hostRequestManager = hostRequestManager;
  }

  /**
   * ワークフローを作成します
   * @param eventId イベントID
   * @param allowPublicApply 並行公募フラグ
   * @returns 作成されたワークフロー
   */
  async createWorkflow(
    eventId: number,
    allowPublicApply: boolean = false,
  ): Promise<HostWorkflowWithRelations> {
    try {
      const workflow = await prisma.hostWorkflow.create({
        data: {
          eventId,
          allowPublicApply,
        },
        include: {
          event: true,
          requests: true,
        },
      });

      logger.info(`ワークフローを作成しました: Event=${eventId}`);
      return workflow;
    } catch (error) {
      logger.error('ワークフローの作成に失敗しました:', error);
      throw error;
    }
  }

  /**
   * ワークフローを取得します
   * @param eventId イベントID
   * @returns ワークフロー
   */
  async getWorkflow(
    eventId: number,
  ): Promise<HostWorkflowWithRelations | null> {
    try {
      return await prisma.hostWorkflow.findUnique({
        where: { eventId },
        include: {
          event: true,
          requests: {
            include: {
              user: true,
            },
            orderBy: {
              priority: 'asc',
            },
          },
        },
      });
    } catch (error) {
      logger.error('ワークフローの取得に失敗しました:', error);
      throw error;
    }
  }

  /**
   * ワークフローの公募設定を更新します
   * @param eventId イベントID
   * @param allowPublicApply 並行公募フラグ
   * @param publicApplyMessageId 公募メッセージID（公募開始時）
   * @returns 更新されたワークフロー
   */
  async updatePublicApplySettings(
    eventId: number,
    allowPublicApply: boolean,
    publicApplyMessageId?: string,
  ): Promise<HostWorkflowWithRelations> {
    try {
      const updateData: {
        allowPublicApply: boolean;
        publicApplyMessageId?: string;
      } = { allowPublicApply };
      if (publicApplyMessageId !== undefined) {
        updateData.publicApplyMessageId = publicApplyMessageId;
      }

      const workflow = await prisma.hostWorkflow.update({
        where: { eventId },
        data: updateData,
        include: {
          event: true,
          requests: true,
        },
      });

      logger.info(
        `ワークフローの公募設定を更新しました: Event=${eventId}, AllowPublicApply=${allowPublicApply}`,
      );
      return workflow;
    } catch (error) {
      logger.error('ワークフロー公募設定の更新に失敗しました:', error);
      throw error;
    }
  }

  /**
   * ワークフローを開始します（最初の候補者にお伺いを送信）
   * @param eventId イベントID
   * @returns 開始されたワークフロー
   */
  async startWorkflow(eventId: number): Promise<HostWorkflowWithRelations> {
    try {
      const workflow = await this.getWorkflow(eventId);
      if (!workflow) {
        throw new Error(`ワークフローが見つかりません: Event=${eventId}`);
      }

      // 最初の候補者（priority=1）を取得
      const firstRequest = workflow.requests.find((r) => r.priority === 1);
      if (!firstRequest) {
        throw new Error(`候補者が設定されていません: Event=${eventId}`);
      }

      // 最初の候補者のステータスをPENDINGに更新
      await this._hostRequestManager.updateRequestStatus(
        firstRequest.id,
        'PENDING',
        new Date(Date.now() + 24 * 60 * 60 * 1000), // 24時間後に期限
      );

      logger.info(
        `ワークフローを開始しました: Event=${eventId}, FirstCandidate=${firstRequest.userId}`,
      );

      return (await this.getWorkflow(eventId)) as HostWorkflowWithRelations;
    } catch (error) {
      logger.error('ワークフローの開始に失敗しました:', error);
      throw error;
    }
  }

  /**
   * ワークフローを完了します
   * @param eventId イベントID
   * @param hostUserId 決定した主催者のユーザーID
   * @returns 完了したワークフロー
   */
  async completeWorkflow(
    eventId: number,
    hostUserId: number,
  ): Promise<HostWorkflowWithRelations> {
    try {
      // イベントの主催者を設定
      await prisma.event.update({
        where: { id: eventId },
        data: { hostId: hostUserId },
      });

      // 承認されたリクエストをACCEPTEDに
      await prisma.hostRequest.updateMany({
        where: {
          workflowId: {
            in: await prisma.hostWorkflow
              .findMany({
                where: { eventId },
                select: { id: true },
              })
              .then((workflows) => workflows.map((w) => w.id)),
          },
          userId: hostUserId,
        },
        data: {
          status: 'ACCEPTED',
        },
      });

      // 他のpendingなリクエストをDECLINEDに
      await prisma.hostRequest.updateMany({
        where: {
          workflowId: {
            in: await prisma.hostWorkflow
              .findMany({
                where: { eventId },
                select: { id: true },
              })
              .then((workflows) => workflows.map((w) => w.id)),
          },
          status: 'PENDING',
        },
        data: {
          status: 'DECLINED',
        },
      });

      const workflow = await this.getWorkflow(eventId);
      logger.info(
        `ワークフローを完了しました: Event=${eventId}, Host=${hostUserId}`,
      );
      return workflow as HostWorkflowWithRelations;
    } catch (error) {
      logger.error('ワークフローの完了に失敗しました:', error);
      throw error;
    }
  }

  /**
   * ワークフローをキャンセルします
   * @param eventId イベントID
   * @returns キャンセルされたワークフロー
   */
  async cancelWorkflow(
    eventId: number,
  ): Promise<HostWorkflowWithRelations | null> {
    try {
      // 全てのpendingなリクエストをキャンセル
      await prisma.hostRequest.updateMany({
        where: {
          workflowId: {
            in: await prisma.hostWorkflow
              .findMany({
                where: { eventId },
                select: { id: true },
              })
              .then((workflows) => workflows.map((w) => w.id)),
          },
          status: 'PENDING',
        },
        data: {
          status: 'DECLINED',
        },
      });

      const workflow = await this.getWorkflow(eventId);
      logger.info(`ワークフローをキャンセルしました: Event=${eventId}`);

      return workflow;
    } catch (error) {
      logger.error('ワークフローのキャンセルに失敗しました:', error);
      throw error;
    }
  }

  /**
   * 次の候補者に進みます
   * @param eventId イベントID
   * @returns 次の候補者のお伺いリクエスト、または null（全候補者終了）
   */
  async proceedToNextCandidate(
    eventId: number,
  ): Promise<HostRequestWithRelations | null> {
    try {
      const workflow = await this.getWorkflow(eventId);
      if (!workflow) {
        throw new Error(`ワークフローが見つかりません: Event=${eventId}`);
      }

      // 現在のpendingリクエストの次の候補者を取得
      const currentPendingRequest = workflow.requests.find(
        (r) => r.status === 'PENDING',
      );
      const currentPriority = currentPendingRequest?.priority || 0;
      const nextPriority = currentPriority + 1;

      const nextCandidate = workflow.requests.find(
        (request) =>
          request.priority === nextPriority && request.status === 'WAITING',
      );

      if (nextCandidate) {
        // 次の候補者のステータスをPENDINGに更新
        await this._hostRequestManager.updateRequestStatus(
          nextCandidate.id,
          'PENDING',
          new Date(Date.now() + 24 * 60 * 60 * 1000), // 24時間後に期限
        );

        logger.info(
          `次の候補者に進みました: Event=${eventId}, Priority=${nextPriority}, User=${nextCandidate.userId}`,
        );

        return await this._hostRequestManager.getRequestWithRelations(
          nextCandidate.id,
        );
      } else {
        // 全候補者が終了
        logger.info(`全候補者が終了しました: Event=${eventId}`);
        return null;
      }
    } catch (error) {
      logger.error('次候補者への進行に失敗しました:', error);
      throw error;
    }
  }

  /**
   * ワークフローの進捗状況を取得します
   * @param eventId イベントID
   * @returns 進捗情報
   */
  async getWorkflowProgress(eventId: number): Promise<{
    workflow: HostWorkflowWithRelations | null;
    requests: HostRequestWithRelations[];
    currentRequest: HostRequestWithRelations | null;
    totalCandidates: number;
    currentPosition: number;
  }> {
    try {
      const workflow = await this.getWorkflow(eventId);
      const requests = workflow?.requests || [];

      // 現在PENDINGの候補者を取得
      const currentRequest =
        requests.find((r) => r.status === 'PENDING') || null;
      const currentPosition = currentRequest?.priority || 0;

      return {
        workflow,
        requests: requests as HostRequestWithRelations[],
        currentRequest: currentRequest as HostRequestWithRelations | null,
        totalCandidates: requests.length,
        currentPosition,
      };
    } catch (error) {
      logger.error('ワークフロー進捗の取得に失敗しました:', error);
      throw error;
    }
  }

  /**
   * 進行中のワークフロー一覧を取得します（PENDINGリクエストがあるワークフロー）
   * @returns 進行中のワークフロー一覧
   */
  async getActiveWorkflows(): Promise<HostWorkflowWithRelations[]> {
    try {
      return await prisma.hostWorkflow.findMany({
        where: {
          requests: {
            some: {
              status: 'PENDING',
            },
          },
        },
        include: {
          event: true,
          requests: {
            include: {
              user: true,
            },
            orderBy: {
              priority: 'asc',
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });
    } catch (error) {
      logger.error('進行中ワークフローの取得に失敗しました:', error);
      throw error;
    }
  }

  /**
   * ワークフローを削除します
   * @param eventId イベントID
   */
  async deleteWorkflow(eventId: number): Promise<void> {
    try {
      // 関連するお伺いリクエストも削除
      await this._hostRequestManager.deleteRequestsByEvent(eventId);

      await prisma.hostWorkflow.delete({
        where: { eventId },
      });

      logger.info(`ワークフローを削除しました: Event=${eventId}`);
    } catch (error) {
      logger.error('ワークフローの削除に失敗しました:', error);
      throw error;
    }
  }
}

/**
 * HostWorkflowManagerのシングルトンインスタンス
 */
export const hostWorkflowManager = new HostWorkflowManager(hostRequestManager);

export default hostWorkflowManager;
