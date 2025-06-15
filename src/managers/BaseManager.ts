import { logger } from '../utils/log.js';
import { databaseManager } from '../database/DatabaseManager.js';
import { OperationResult, ErrorInfo } from '../types/common.js';

/**
 * マネージャークラスの基底クラス
 * 共通のインターフェースと機能を提供
 */
export abstract class BaseManager {
  protected static instances: Map<string, BaseManager> = new Map();

  protected constructor() {
    // シングルトンパターンの実装
    const className = this.constructor.name;
    if (BaseManager.instances.has(className)) {
      return BaseManager.instances.get(className)!;
    }
    BaseManager.instances.set(className, this);
  }

  /**
   * マネージャーの名前を取得
   */
  protected abstract getManagerName(): string;

  /**
   * マネージャーの初期化処理
   */
  public async initialize(): Promise<void> {
    try {
      logger.info(`${this.getManagerName()}を初期化中...`);
      await this.onInitialize();
      logger.info(`${this.getManagerName()}の初期化が完了しました`);
    } catch (error) {
      logger.error(`${this.getManagerName()}の初期化に失敗:`, error);
      throw error;
    }
  }

  /**
   * 個別の初期化処理（サブクラスで実装）
   */
  protected async onInitialize(): Promise<void> {
    // デフォルトでは何もしない
  }

  /**
   * マネージャーの終了処理
   */
  public async cleanup(): Promise<void> {
    try {
      logger.info(`${this.getManagerName()}のクリーンアップ中...`);
      await this.onCleanup();
      logger.info(`${this.getManagerName()}のクリーンアップが完了しました`);
    } catch (error) {
      logger.error(`${this.getManagerName()}のクリーンアップに失敗:`, error);
      throw error;
    }
  }

  /**
   * 個別のクリーンアップ処理（サブクラスで実装）
   */
  protected async onCleanup(): Promise<void> {
    // デフォルトでは何もしない
  }

  /**
   * データベースマネージャーを取得
   */
  protected getDatabaseManager() {
    return databaseManager;
  }

  /**
   * 操作結果を作成
   */
  protected createSuccessResult<T>(data: T, message?: string): OperationResult<T> {
    return {
      success: true,
      data,
      ...(message && { message }),
    };
  }

  /**
   * エラー結果を作成
   */
  protected createErrorResult(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ): OperationResult {
    const error: ErrorInfo = {
      code,
      message,
      ...(details && { details }),
    };

    return {
      success: false,
      error,
    };
  }

  /**
   * エラーハンドリング
   */
  protected handleError(
    error: unknown,
    operation: string,
    context?: Record<string, unknown>,
  ): OperationResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = error instanceof Error ? error.name : 'UnknownError';

    logger.error(`${this.getManagerName()}の${operation}に失敗:`, {
      error: errorMessage,
      context,
    });

    return this.createErrorResult(
      errorCode,
      `${operation}に失敗しました: ${errorMessage}`,
      context,
    );
  }

  /**
   * 非同期操作を安全に実行
   */
  protected async safeExecute<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: Record<string, unknown>,
  ): Promise<OperationResult<T>> {
    try {
      logger.debug(`${this.getManagerName()}の${operationName}を実行中`, context);
      const result = await operation();
      logger.debug(`${this.getManagerName()}の${operationName}が完了`, context);
      return this.createSuccessResult(result);
    } catch (error) {
      return this.handleError(error, operationName, context);
    }
  }

  /**
   * バリデーション機能
   */
  protected validate<T>(
    value: T,
    validator: (value: T) => boolean,
    errorMessage: string,
  ): void {
    if (!validator(value)) {
      throw new Error(errorMessage);
    }
  }

  /**
   * 必須フィールドのチェック
   */
  protected validateRequired<T>(
    value: T | undefined | null,
    fieldName: string,
  ): asserts value is T {
    if (value === undefined || value === null) {
      throw new Error(`${fieldName}は必須です`);
    }
  }

  /**
   * 文字列の空チェック
   */
  protected validateNotEmpty(value: string | undefined | null, fieldName: string): asserts value is string {
    this.validateRequired(value, fieldName);
    if (value.trim() === '') {
      throw new Error(`${fieldName}は空文字列にできません`);
    }
  }

  /**
   * 数値の範囲チェック
   */
  protected validateRange(
    value: number,
    min: number,
    max: number,
    fieldName: string,
  ): void {
    if (value < min || value > max) {
      throw new Error(`${fieldName}は${min}から${max}の範囲で指定してください`);
    }
  }

  /**
   * 健康状態チェック
   */
  public async healthCheck(): Promise<OperationResult<boolean>> {
    return this.safeExecute(
      async () => {
        // データベース接続チェック
        const dbHealthy = await this.getDatabaseManager().healthCheck();
        if (!dbHealthy) {
          throw new Error('データベース接続に問題があります');
        }

        // 個別のヘルスチェック
        await this.onHealthCheck();
        
        return true;
      },
      'ヘルスチェック',
    );
  }

  /**
   * 個別のヘルスチェック処理（サブクラスで実装）
   */
  protected async onHealthCheck(): Promise<void> {
    // デフォルトでは何もしない
  }

  /**
   * パフォーマンス統計情報を取得
   */
  public async getPerformanceStats(): Promise<OperationResult<Record<string, unknown>>> {
    return this.safeExecute(
      async () => {
        const dbStats = await this.getDatabaseManager().getStats();
        const customStats = await this.onGetPerformanceStats();
        
        return {
          database: dbStats,
          manager: customStats,
          timestamp: new Date(),
        };
      },
      'パフォーマンス統計取得',
    );
  }

  /**
   * 個別のパフォーマンス統計取得（サブクラスで実装）
   */
  protected async onGetPerformanceStats(): Promise<Record<string, unknown>> {
    return {};
  }
}