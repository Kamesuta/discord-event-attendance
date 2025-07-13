/**
 * 主催者お伺いメッセージ用のMessageUpdater実装
 * 主催者お伺い関連のメッセージの判定・更新・取得を担当
 */
import { Message, EmbedBuilder } from 'discord.js';
import { EventWithHost } from '../event/EventManager.js';
import { MessageUpdater, MessageUpdateContext } from './MessageUpdater.js';
import { config } from '../utils/config.js';
import { client } from '../utils/client.js';
import { logger } from '../utils/log.js';
import { hostRequestManager } from '../event/HostRequestManager.js';
import { hostWorkflowManager } from '../event/HostWorkflowManager.js';

/**
 * 主催者お伺いメッセージ更新クラス
 */
class HostRequestMessageUpdater implements MessageUpdater {
  /**
   * メッセージが主催者お伺い関連かチェック
   * @param message メッセージ
   * @returns boolean
   */
  canParseMessage(message: Message): boolean {
    try {
      // Embedのfooterに「HostRequest:」や「HostWorkflow:」が含まれているかチェック
      const embeds = message.embeds;
      if (embeds.length === 0) return false;

      const firstEmbed = embeds[0];
      if (!firstEmbed.footer?.text) return false;

      return (
        firstEmbed.footer.text.includes('HostRequest:') ||
        firstEmbed.footer.text.includes('HostWorkflow:')
      );
    } catch (error) {
      logger.error('主催者お伺いメッセージ判定でエラー:', error);
      return false;
    }
  }

  /**
   * 主催者お伺いメッセージを更新
   * @param message メッセージ
   * @param _context 更新コンテキスト
   * @returns Promise<Message | undefined>
   */
  async updateMessage(
    message: Message,
    _context?: MessageUpdateContext,
  ): Promise<Message | undefined> {
    try {
      // Embedからメタデータを抽出
      const metadata = this._extractMetadata(message);
      if (!metadata) {
        logger.warn('主催者お伺いメッセージのメタデータが抽出できませんでした');
        return;
      }

      // HostRequestの場合の更新
      if (metadata.hostRequestId) {
        return await this._updateHostRequestMessage(
          message,
          metadata.hostRequestId,
        );
      }

      // HostWorkflowの場合の更新
      if (metadata.hostWorkflowId) {
        return await this._updateHostWorkflowMessage(
          message,
          metadata.hostWorkflowId,
        );
      }

      return;
    } catch (error) {
      logger.error('主催者お伺いメッセージ更新でエラー:', error);
      return;
    }
  }

  /**
   * 指定されたイベントに関連する主催者お伺いメッセージを取得
   * @param event イベント
   * @returns Promise<Message[]>
   */
  async getRelatedMessages(event: EventWithHost): Promise<Message[]> {
    const messages: Message[] = [];

    try {
      // 主催者お伺い管理チャンネルからメッセージを検索
      const channel = client.channels.cache.get(config.host_request_channel_id);
      if (!channel || !channel.isTextBased()) {
        return messages;
      }

      // 最近のメッセージを取得
      const fetchedMessages = await channel.messages.fetch({ limit: 100 });

      for (const [, message] of fetchedMessages) {
        if (this.canParseMessage(message)) {
          const metadata = this._extractMetadata(message);
          if (metadata?.eventId === event.id) {
            messages.push(message);
          }
        }
      }

      logger.info(
        `イベント ${event.id} の主催者お伺い関連メッセージ ${messages.length} 件を発見`,
      );
    } catch (error) {
      logger.error('主催者お伺い関連メッセージ取得でエラー:', error);
    }

    return messages;
  }

  /**
   * メッセージからメタデータを抽出
   * @param message メッセージ
   * @returns object | null
   */
  private _extractMetadata(message: Message): {
    hostRequestId?: number;
    hostWorkflowId?: number;
    eventId?: number;
  } | null {
    try {
      const embed = message.embeds[0];
      if (!embed?.footer?.text) return null;

      const metadata: {
        hostRequestId?: number;
        hostWorkflowId?: number;
        eventId?: number;
      } = {};

      // HostRequestIDの抽出
      const hostRequestMatch = embed.footer.text.match(/HostRequest:(\d+)/);
      if (hostRequestMatch) {
        metadata.hostRequestId = parseInt(hostRequestMatch[1]);
      }

      // HostWorkflowIDの抽出
      const workflowMatch = embed.footer.text.match(/HostWorkflow:(\d+)/);
      if (workflowMatch) {
        metadata.hostWorkflowId = parseInt(workflowMatch[1]);
      }

      // EventIDの抽出
      const eventMatch = embed.footer.text.match(/Event:(\d+)/);
      if (eventMatch) {
        metadata.eventId = parseInt(eventMatch[1]);
      }

      return metadata;
    } catch (error) {
      logger.error('メタデータ抽出でエラー:', error);
      return null;
    }
  }

  /**
   * お伺いリクエストメッセージを更新
   * @param message メッセージ
   * @param hostRequestId お伺いリクエストID
   * @returns Promise<Message | undefined>
   */
  private async _updateHostRequestMessage(
    message: Message,
    hostRequestId: number,
  ): Promise<Message | undefined> {
    try {
      const hostRequest = await hostRequestManager.getRequest(hostRequestId);
      if (!hostRequest) {
        logger.warn(`お伺いリクエストが見つかりません: ID=${hostRequestId}`);
        return;
      }

      // 状態に応じてEmbedを更新
      const embed = new EmbedBuilder()
        .setTitle(this._getStatusTitle(hostRequest.status))
        .setDescription(
          `**イベント:** ${hostRequest.workflow.event.name}\n` +
            `**対象ユーザー:** ${hostRequest.user.username}\n` +
            `**優先順位:** ${hostRequest.priority}番目\n` +
            `**期限:** <t:${Math.floor(hostRequest.expiresAt.getTime() / 1000)}:R>\n` +
            `**状態:** ${this._getStatusText(hostRequest.status)}`,
        )
        .setColor(this._getStatusColor(hostRequest.status))
        .setFooter({
          text: `HostRequest:${hostRequest.id} | Event:${hostRequest.workflow.event.id}`,
        })
        .setTimestamp();

      return await message.edit({
        embeds: [embed],
        components: [], // ボタンは状態更新時に無効化
      });
    } catch (error) {
      logger.error('お伺いリクエストメッセージ更新でエラー:', error);
      return;
    }
  }

  /**
   * ワークフローメッセージを更新
   * @param message メッセージ
   * @param hostWorkflowId ワークフローID
   * @returns Promise<Message | undefined>
   */
  private async _updateHostWorkflowMessage(
    message: Message,
    hostWorkflowId: number,
  ): Promise<Message | undefined> {
    try {
      const workflow = await hostWorkflowManager.getWorkflow(hostWorkflowId);
      if (!workflow) {
        logger.warn(`ワークフローが見つかりません: ID=${hostWorkflowId}`);
        return;
      }

      // ワークフローの現在状況を取得
      const requests = await hostRequestManager.getRequestsByEvent(
        workflow.eventId,
      );
      const currentRequest = requests.find((req) => req.status === 'PENDING');

      // ワークフローの状態を推定
      const workflowStatus = this._inferWorkflowStatus(requests);
      const currentPriority = currentRequest?.priority || 0;

      const embed = new EmbedBuilder()
        .setTitle(
          `🎯 主催者お伺いワークフロー - ${this._getWorkflowStatusText(workflowStatus)}`,
        )
        .setDescription(
          `**イベント:** ${workflow.event.name}\n` +
            `**現在の進行:** ${currentPriority}番目の候補者\n` +
            `**現在の対象:** ${currentRequest ? currentRequest.user.username : '完了'}\n` +
            `**公募併用:** ${workflow.allowPublicApply ? '有効' : '無効'}\n` +
            `**全候補者数:** ${requests.length}名`,
        )
        .setColor(this._getWorkflowStatusColor(workflowStatus))
        .setFooter({
          text: `HostWorkflow:${workflow.id} | Event:${workflow.event.id}`,
        })
        .setTimestamp();

      return await message.edit({
        embeds: [embed],
      });
    } catch (error) {
      logger.error('ワークフローメッセージ更新でエラー:', error);
      return;
    }
  }

  /**
   * ステータスに応じたタイトルを取得
   * @param status ステータス
   * @returns string
   */
  private _getStatusTitle(status: string): string {
    switch (status) {
      case 'pending':
        return '⏳ 主催者お伺い中';
      case 'accepted':
        return '✅ 主催者決定';
      case 'declined':
        return '❌ お断り';
      case 'expired':
        return '⏰ 期限切れ';
      default:
        return '📋 主催者お伺い';
    }
  }

  /**
   * ステータスに応じたテキストを取得
   * @param status ステータス
   * @returns string
   */
  private _getStatusText(status: string): string {
    switch (status) {
      case 'pending':
        return '回答待ち';
      case 'accepted':
        return '受諾済み';
      case 'declined':
        return 'お断り';
      case 'expired':
        return '期限切れ';
      default:
        return '不明';
    }
  }

  /**
   * リクエストからワークフローの状態を推定
   * @param requests お伺いリクエスト一覧
   * @returns ワークフロー状態
   */
  private _inferWorkflowStatus(requests: Array<{ status: string }>): string {
    if (!requests || requests.length === 0) {
      return 'planning';
    }

    const hasAccepted = requests.some((r) => r.status === 'ACCEPTED');
    if (hasAccepted) {
      return 'completed';
    }

    const hasPending = requests.some((r) => r.status === 'PENDING');
    if (hasPending) {
      return 'requesting';
    }

    const hasWaiting = requests.some((r) => r.status === 'WAITING');
    if (hasWaiting) {
      return 'planning';
    }

    return 'cancelled';
  }

  /**
   * ステータスに応じた色を取得
   * @param status ステータス
   * @returns number
   */
  private _getStatusColor(status: string): number {
    switch (status) {
      case 'pending':
        return 0xffa500; // オレンジ
      case 'accepted':
        return 0x00ff00; // 緑
      case 'declined':
        return 0xff0000; // 赤
      case 'expired':
        return 0x808080; // グレー
      default:
        return 0x3498db; // 青
    }
  }

  /**
   * ワークフローステータスに応じたテキストを取得
   * @param status ワークフローステータス
   * @returns string
   */
  private _getWorkflowStatusText(status: string): string {
    switch (status) {
      case 'planning':
        return '計画中';
      case 'requesting':
        return '依頼中';
      case 'completed':
        return '完了';
      case 'cancelled':
        return 'キャンセル';
      default:
        return '不明';
    }
  }

  /**
   * ワークフローステータスに応じた色を取得
   * @param status ワークフローステータス
   * @returns number
   */
  private _getWorkflowStatusColor(status: string): number {
    switch (status) {
      case 'planning':
        return 0x3498db; // 青
      case 'requesting':
        return 0xffa500; // オレンジ
      case 'completed':
        return 0x00ff00; // 緑
      case 'cancelled':
        return 0x808080; // グレー
      default:
        return 0x3498db; // 青
    }
  }
}

/**
 * HostRequestMessageUpdaterのインスタンス
 */
export const hostRequestMessageUpdater = new HostRequestMessageUpdater();

export default new HostRequestMessageUpdater();
