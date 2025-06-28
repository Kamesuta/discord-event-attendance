import { Message } from 'discord.js';
import { EventWithHost } from './EventManager.js';

/**
 * Discordメッセージの更新処理を共通化するインターフェース
 */
export interface MessageUpdater {
  /**
   * 既存のメッセージがこのMessageUpdaterでパースできるか構文的に軽量判定する
   * @param message メッセージ
   * @returns パース可能かどうか
   */
  canParseMessage(message: Message): boolean;

  /**
   * 既存のメッセージを解析して更新する
   * @param message メッセージ
   * @returns 更新されたメッセージ
   */
  updateMessage(message: Message): Promise<Message | undefined>;

  /**
   * 指定されたイベントに関連するメッセージを取得する
   * @param event イベント
   * @returns 関連するメッセージの配列
   */
  getRelatedMessages(event: EventWithHost): Promise<Message[]>;
}
