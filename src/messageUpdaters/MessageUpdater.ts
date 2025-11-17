import { Message } from 'discord.js';
import { EventWithHost } from '@/domain/queries/eventQueries';

/**
 * メッセージ更新時のコンテキスト情報
 */
export interface MessageUpdateContext {
  /**
   * 強制的に指定するイベントID（単一イベント情報メッセージのみに対して有効）
   */
  forceEventId?: number;
}

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
   * @param context 更新コンテキスト
   * @returns 更新されたメッセージ
   */
  updateMessage(
    message: Message,
    context?: MessageUpdateContext,
  ): Promise<Message | undefined>;

  /**
   * 指定されたイベントに関連するメッセージを取得する
   * @param event イベント
   * @returns 関連するメッセージの配列
   */
  getRelatedMessages(event: EventWithHost): Promise<Message[]>;
}
