import { EventWithHost } from '../../../event/EventManager.js';

/**
 * スケジュールメッセージのデータ構造体
 * start 開始日
 * end 終了日
 * events イベント配列
 */
export class ScheduleMessageData {
  /**
   * ScheduleMessageDataのコンストラクタ
   * @param start 開始日
   * @param end 終了日
   * @param events イベント配列
   */
  constructor(
    public start: Date,
    public end: Date,
    public events: EventWithHost[],
  ) {}
}
