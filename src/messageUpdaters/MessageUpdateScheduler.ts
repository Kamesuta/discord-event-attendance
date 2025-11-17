import type { EventWithHost } from '@/domain/queries/eventQueries';
import { eventManager } from '@/domain/services/EventManager';
import { logger } from '@/utils/log';
import type { MessageUpdateManager } from './MessageUpdateManager.js';

/**
 * 非同期メッセージ更新スケジューラ
 * - イベントIDをキューに積み、最後の操作から一定時間後にバッチ実行
 * - 実行中に新規要求が来た場合は次バッチへ
 */
export class MessageUpdateScheduler {
  private readonly _pendingIds = new Set<number>();
  private _timer: NodeJS.Timeout | null = null;
  private _running = false;
  private _lastEnqueueAt = 0;

  /**
   * @param _manager メッセージ更新マネージャ
   * @param _debounceMs デバウンス時間（ミリ秒）
   */
  constructor(
    private readonly _manager: MessageUpdateManager,
    private readonly _debounceMs = 60_000,
  ) {}

  /**
   * 更新要求を追加（イベントIDまたはEventWithHost）
   * @param event イベントIDまたはイベント
   */
  enqueue(event: number | EventWithHost): void {
    const id = typeof event === 'number' ? event : event.id;
    this._pendingIds.add(id);
    this._lastEnqueueAt = Date.now();

    // デバウンス: 既存タイマーがあればリセット
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._timer = setTimeout(() => {
      void this._runBatch();
    }, this._debounceMs);
    logger.debug?.(
      `メッセージ更新を予約: id=${id}, pending=${this._pendingIds.size}`,
    );
  }

  /** 保留中を即時実行（デバッグ/緊急用） */
  async flushNow(): Promise<void> {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    await this._runBatch();
  }

  /** バッチ実行本体 */
  private async _runBatch(): Promise<void> {
    // 実行中なら、残タスクがあれば再スケジュールのみ行う
    if (this._running) {
      this._scheduleNextIfNeeded();
      return;
    }

    // 実行スナップショットを取得
    const batch = Array.from(this._pendingIds);
    if (batch.length === 0) {
      return; // 何も無ければ何もしない
    }
    this._pendingIds.clear();
    this._running = true;

    const startedAt = Date.now();
    logger.info(
      `メッセージ更新バッチ開始: 件数=${batch.length} ids=[${batch.join(',')}]`,
    );

    let failed = 0;
    for (const id of batch) {
      try {
        const event = await eventManager.getEventFromId(id);
        if (!event) continue;
        await this._manager.updateRelatedMessages(event);
      } catch (e) {
        failed += 1;
        logger.error(`メッセージ更新失敗 (event=${id}): ${String(e)}`);
      }
    }

    const elapsed = Date.now() - startedAt;
    logger.info(
      `メッセージ更新バッチ終了: 件数=${batch.length}, 失敗=${failed}, 所要=${elapsed}ms`,
    );

    this._running = false;
    // 実行中に追加された分があれば再スケジュール
    this._scheduleNextIfNeeded();
  }

  /** 残タスクがあれば、lastEnqueueAt + debounceMs にあわせて再スケジュール */
  private _scheduleNextIfNeeded(): void {
    if (this._pendingIds.size === 0) return;
    const delay = Math.max(
      0,
      this._lastEnqueueAt + this._debounceMs - Date.now(),
    );
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._timer = setTimeout(() => {
      void this._runBatch();
    }, delay);
  }
}
