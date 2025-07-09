import { HostWorkflow, Event } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/log.js';
import {
  HostRequestManager,
  HostRequestWithRelations,
  hostRequestManager,
} from './HostRequestManager.js';

/**
 * ワークフローの状態
 */
export type HostWorkflowStatus =
  | 'planning'
  | 'requesting'
  | 'completed'
  | 'cancelled';

/**
 * HostWorkflowとリレーション情報を含む型
 */
export type HostWorkflowWithRelations = HostWorkflow & {
  event: Event;
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
   * @param customMessage カスタム依頼メッセージ
   * @returns 作成されたワークフロー
   */
  async createWorkflow(
    eventId: number,
    allowPublicApply: boolean = false,
    customMessage?: string,
  ): Promise<HostWorkflowWithRelations> {
    try {
      const workflow = await prisma.hostWorkflow.create({
        data: {
          eventId,
          status: 'planning',
          allowPublicApply,
          customMessage,
        },
        include: {
          event: true,
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
        },
      });
    } catch (error) {
      logger.error('ワークフローの取得に失敗しました:', error);
      throw error;
    }
  }

  /**
   * ワークフローの状態を更新します
   * @param eventId イベントID
   * @param status 新しい状態
   * @param publicApplyMessageId 公募メッセージID（公募開始時）
   * @returns 更新されたワークフロー
   */
  async updateWorkflowStatus(
    eventId: number,
    status: HostWorkflowStatus,
    publicApplyMessageId?: string,
  ): Promise<HostWorkflowWithRelations> {
    try {
      const updateData: {
        status: HostWorkflowStatus;
        publicApplyMessageId?: string;
      } = { status };
      if (publicApplyMessageId) {
        updateData.publicApplyMessageId = publicApplyMessageId;
      }

      const workflow = await prisma.hostWorkflow.update({
        where: { eventId },
        data: updateData,
        include: {
          event: true,
        },
      });

      logger.info(
        `ワークフローの状態を更新しました: Event=${eventId}, Status=${status}`,
      );
      return workflow;
    } catch (error) {
      logger.error('ワークフロー状態の更新に失敗しました:', error);
      throw error;
    }
  }

  /**
   * ワークフローの現在の依頼順を更新します
   * @param eventId イベントID
   * @param currentPriority 現在の依頼順
   * @returns 更新されたワークフロー
   */
  async updateCurrentPriority(
    eventId: number,
    currentPriority: number,
  ): Promise<HostWorkflowWithRelations> {
    try {
      const workflow = await prisma.hostWorkflow.update({
        where: { eventId },
        data: { currentPriority },
        include: {
          event: true,
        },
      });

      logger.info(
        `ワークフローの現在依頼順を更新しました: Event=${eventId}, Priority=${currentPriority}`,
      );
      return workflow;
    } catch (error) {
      logger.error('ワークフロー依頼順の更新に失敗しました:', error);
      throw error;
    }
  }

  /**
   * ワークフローを開始します（計画状態からリクエスト状態へ）
   * @param eventId イベントID
   * @returns 開始されたワークフロー
   */
  async startWorkflow(eventId: number): Promise<HostWorkflowWithRelations> {
    try {
      const workflow = await this.getWorkflow(eventId);
      if (!workflow) {
        throw new Error(`ワークフローが見つかりません: Event=${eventId}`);
      }

      if (workflow.status !== 'planning') {
        throw new Error(
          `ワークフローを開始できません。現在の状態: ${workflow.status}`,
        );
      }

      const updatedWorkflow = await this.updateWorkflowStatus(
        eventId,
        'requesting',
      );
      logger.info(`ワークフローを開始しました: Event=${eventId}`);

      return updatedWorkflow;
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

      // ワークフローを完了状態に
      const workflow = await this.updateWorkflowStatus(eventId, 'completed');

      // 他のpendingなリクエストをキャンセル
      await prisma.hostRequest.updateMany({
        where: {
          eventId,
          status: 'pending',
        },
        data: {
          status: 'declined',
        },
      });

      logger.info(
        `ワークフローを完了しました: Event=${eventId}, Host=${hostUserId}`,
      );
      return workflow;
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
  async cancelWorkflow(eventId: number): Promise<HostWorkflowWithRelations> {
    try {
      // 全てのpendingなリクエストをキャンセル
      await prisma.hostRequest.updateMany({
        where: {
          eventId,
          status: 'pending',
        },
        data: {
          status: 'declined',
        },
      });

      const workflow = await this.updateWorkflowStatus(eventId, 'cancelled');
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

      // 次の候補者を取得
      const nextPriority = workflow.currentPriority + 1;
      const nextRequest = await this._hostRequestManager.getRequestsByEvent(
        eventId,
        'pending',
      );

      const nextCandidate = nextRequest.find(
        (request: HostRequestWithRelations) =>
          request.priority === nextPriority,
      );

      if (nextCandidate) {
        // 現在の依頼順を更新
        await this.updateCurrentPriority(eventId, nextPriority);
        logger.info(
          `次の候補者に進みました: Event=${eventId}, Priority=${nextPriority}`,
        );
        return nextCandidate;
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
      const requests =
        await this._hostRequestManager.getRequestsByEvent(eventId);

      let currentRequest = null;
      if (workflow) {
        currentRequest =
          requests.find(
            (request: HostRequestWithRelations) =>
              request.priority === workflow.currentPriority,
          ) || null;
      }

      return {
        workflow,
        requests,
        currentRequest,
        totalCandidates: requests.length,
        currentPosition: workflow ? workflow.currentPriority : 0,
      };
    } catch (error) {
      logger.error('ワークフロー進捗の取得に失敗しました:', error);
      throw error;
    }
  }

  /**
   * 進行中のワークフロー一覧を取得します
   * @returns 進行中のワークフロー一覧
   */
  async getActiveWorkflows(): Promise<HostWorkflowWithRelations[]> {
    try {
      return await prisma.hostWorkflow.findMany({
        where: {
          status: {
            in: ['requesting'],
          },
        },
        include: {
          event: true,
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
