import { Message } from 'discord.js';
import { MessageUpdater, MessageUpdateContext } from './MessageUpdater.js';
import { EventWithHost } from './EventManager.js';
import { logger } from '../utils/log.js';

/**
 * メッセージ更新マネージャー
 * 複数のMessageUpdaterを統一的に管理し、メッセージの種類を自動判定して更新処理を実行
 */
class MessageUpdateManager {
  /**
   * MessageUpdateManagerを作成
   * @param _updaters 登録するMessageUpdaterの配列
   */
  constructor(private _updaters: MessageUpdater[]) {}

  /**
   * メッセージを解析して適切なUpdaterを見つける
   * @param message Discordメッセージ
   * @returns 対応するMessageUpdater、見つからない場合はundefined
   */
  findUpdaterForMessage(message: Message): MessageUpdater | undefined {
    return this._updaters.find((updater) => updater.canParseMessage(message));
  }

  /**
   * メッセージを更新
   * @param message 更新するメッセージ
   * @param context 更新コンテキスト
   * @returns 更新されたメッセージ
   */
  async updateMessage(
    message: Message,
    context?: MessageUpdateContext,
  ): Promise<Message | undefined> {
    const updater = this.findUpdaterForMessage(message);
    if (!updater) {
      throw new Error('このメッセージは更新できません');
    }

    logger.info(
      `メッセージ更新: ${updater.constructor.name} でメッセージ ${message.id} を更新`,
    );

    try {
      const updatedMessage = await updater.updateMessage(message, context);
      logger.info(`メッセージ更新成功: ${message.id}`);
      return updatedMessage;
    } catch (error) {
      logger.error(`メッセージ更新失敗: ${String(error)}`);
      throw error;
    }
  }

  /**
   * 特定イベントの関連メッセージをすべて更新
   * @param event イベント
   * @returns 更新されたメッセージの配列
   */
  async updateRelatedMessages(event: EventWithHost): Promise<Message[]> {
    const updatedMessages: Message[] = [];

    // 各Updaterから関連メッセージを取得
    for (const updater of this._updaters) {
      try {
        const relatedMessages = await updater.getRelatedMessages(event);

        // 各メッセージを更新
        for (const message of relatedMessages) {
          try {
            const updatedMessage = await updater.updateMessage(message);
            if (updatedMessage) {
              updatedMessages.push(updatedMessage);
            }
          } catch (error) {
            logger.error(
              `関連メッセージ更新失敗 (${message.id}): ${String(error)}`,
            );
            // 個別の失敗は続行
          }
        }
      } catch (error) {
        logger.error(
          `関連メッセージ取得失敗 (${updater.constructor.name}): ${String(error)}`,
        );
        // Updater単位の失敗は続行
      }
    }

    logger.info(
      `イベント ${event.id} の関連メッセージ ${updatedMessages.length} 件を更新`,
    );
    return updatedMessages;
  }
}

export { MessageUpdateManager };
