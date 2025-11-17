import {
  Message,
  MessageEditOptions,
  BaseMessageOptions,
  TextBasedChannel,
  Webhook,
} from 'discord.js';
import { getWebhook } from './getWebhook.js';
import { logger } from '../../utils/log.js';

/**
 * メッセージ編集を統一的に処理するクラス
 * Webhook経由と通常編集の自動切り替え、コンテンツ再取得を担当
 */
class MessageEditor {
  /**
   * メッセージを編集（Webhook/通常を自動切り替え）
   * @param message 編集対象のメッセージ
   * @param editOptions 編集オプション
   * @returns 編集されたメッセージ
   */
  async editMessage(
    message: Message,
    editOptions: MessageEditOptions | BaseMessageOptions,
  ): Promise<Message> {
    const isWebhookMessage = message.webhookId !== null;

    logger.info(`メッセージ編集: ${message.id} (Webhook: ${isWebhookMessage})`);

    return await this._executeWithFallback(
      message.channel,
      async () => await message.edit(editOptions),
      async (webhook) => await webhook.editMessage(message.id, editOptions),
      '編集',
      isWebhookMessage,
    );
  }

  /**
   * メッセージIDからメッセージを取得（Webhook/通常を自動切り替え）
   * @param messageId メッセージID
   * @param channel 対象チャンネル
   * @returns 取得されたメッセージ
   * @throws {Error} メッセージが見つからない場合
   */
  async fetchMessage(
    messageId: string,
    channel: TextBasedChannel,
  ): Promise<Message> {
    logger.info(`メッセージ取得: ${messageId}`);

    return await this._executeWithFallback(
      channel,
      async () => await channel.messages.fetch(messageId),
      async (webhook) => await webhook.fetchMessage(messageId),
      '取得',
    );
  }

  /**
   * メッセージを再取得（コンテンツが空の場合にWebhook経由で試行）
   * @param message 対象メッセージ
   * @returns 再取得されたメッセージまたは元のメッセージ
   */
  async refetchMessage(message: Message): Promise<Message> {
    // コンテンツが空でない場合はそのまま返す
    if (message.content && message.content.trim() !== '') {
      return message;
    }

    // ここに来ている時点で、Webhookメッセージ or 他のユーザーのメッセージ
    logger.info(`メッセージ再取得: ${message.id} (コンテンツが空)`);

    try {
      return await this._executeWithFallback(
        message.channel,
        async () => await message.fetch(true),
        async (webhook) => await webhook.fetchMessage(message.id),
        '再取得',
      );
    } catch (_error) {
      logger.warn(`メッセージ再取得失敗: ${message.id} - 元のメッセージを使用`);
      return message;
    }
  }

  /**
   * 操作を通常→Webhook の順で実行（フォールバック付き）
   * @param channel 対象チャンネル
   * @param normalOperation 通常の操作
   * @param webhookOperation Webhook操作
   * @param operationName 操作名（ログ用）
   * @param isWebhookFirst 最初にWebhook経由を試行するかどうか
   * @returns 操作結果
   */
  private async _executeWithFallback<T>(
    channel: TextBasedChannel,
    normalOperation: () => Promise<T>,
    webhookOperation: (webhook: Webhook) => Promise<T>,
    operationName: string,
    isWebhookFirst: boolean = false,
  ): Promise<T> {
    // 通常の操作を試行
    const viaChannel = {
      name: '通常',
      fn: normalOperation,
    };

    // Webhook経由を試行
    const viaWebhook = {
      name: 'Webhook',
      fn: async (): Promise<T> => {
        const webhook = await getWebhook(channel);
        return await webhookOperation(webhook.webhook);
      },
    };

    // 実行順序を決定
    const tasks = isWebhookFirst
      ? [viaWebhook, viaChannel]
      : [viaChannel, viaWebhook];

    // 実行順序に従って実行
    for (const { name, fn } of tasks) {
      try {
        const result = await fn();
        logger.debug(`${name}の${operationName}成功`);
        return result;
      } catch (_error) {
        logger.debug(`${name}の${operationName}失敗`);
      }
    }

    // すべての実行が失敗した場合はエラーを投げる
    throw new Error(`${operationName}に失敗しました`);
  }
}

/**
 * メッセージ編集を統一的に処理するシングルトンインスタンス
 */
export const messageEditor = new MessageEditor();
