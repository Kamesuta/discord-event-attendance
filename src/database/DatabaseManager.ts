import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/log.js';
import {
  DatabaseConfig,
  TransactionFunction,
  DatabaseConnectionError,
  TransactionError,
} from '../types/database.js';

/**
 * データベース管理クラス
 * Prisma クライアントの接続管理とトランザクション管理を統一化
 */
export class DatabaseManager {
  private static instance: DatabaseManager;
  private prisma: PrismaClient;
  private isConnected = false;

  private constructor(config?: DatabaseConfig) {
    this.prisma = new PrismaClient({
      log: config?.logLevel ? [config.logLevel] : ['error'],
      datasources: {
        db: {
          url: config?.url || process.env.DATABASE_URL,
        },
      },
    });

    // Prisma のイベントリスナーを設定
    this.setupEventListeners();
  }

  /**
   * DatabaseManager のシングルトンインスタンスを取得
   */
  public static getInstance(config?: DatabaseConfig): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager(config);
    }
    return DatabaseManager.instance;
  }

  /**
   * Prisma クライアントを取得
   */
  public getClient(): PrismaClient {
    return this.prisma;
  }

  /**
   * データベースに接続
   */
  public async connect(): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.prisma.$connect();
        this.isConnected = true;
        logger.info('データベースに接続しました');
      }
    } catch (error) {
      logger.error('データベース接続エラー:', error);
      throw new DatabaseConnectionError(
        'データベースへの接続に失敗しました',
        error as Error,
      );
    }
  }

  /**
   * データベース接続を切断
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.prisma.$disconnect();
        this.isConnected = false;
        logger.info('データベース接続を切断しました');
      }
    } catch (error) {
      logger.error('データベース切断エラー:', error);
    }
  }

  /**
   * トランザクションを実行
   */
  public async transaction<T>(
    fn: TransactionFunction<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, {
        maxWait: options?.maxWait || 5000, // 5秒
        timeout: options?.timeout || 10000, // 10秒
      });
    } catch (error) {
      logger.error('トランザクションエラー:', error);
      throw new TransactionError(
        'トランザクションの実行に失敗しました',
        error as Error,
      );
    }
  }

  /**
   * データベースの健康状態をチェック
   */
  public async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      logger.error('データベースヘルスチェック失敗:', error);
      return false;
    }
  }

  /**
   * データベース統計情報を取得
   */
  public async getStats(): Promise<{
    eventCount: number;
    userCount: number;
    voiceLogCount: number;
  }> {
    try {
      const [eventCount, userCount, voiceLogCount] = await Promise.all([
        this.prisma.event.count(),
        this.prisma.user.count(),
        this.prisma.voiceLog.count(),
      ]);

      return {
        eventCount,
        userCount,
        voiceLogCount,
      };
    } catch (error) {
      logger.error('データベース統計取得エラー:', error);
      throw error;
    }
  }

  /**
   * Raw クエリを実行
   */
  public async executeRaw(query: string, ...params: unknown[]): Promise<unknown> {
    try {
      return await this.prisma.$queryRawUnsafe(query, ...params);
    } catch (error) {
      logger.error('Raw クエリ実行エラー:', error);
      throw error;
    }
  }

  /**
   * Prisma のイベントリスナーを設定
   */
  private setupEventListeners(): void {
    // クエリログの出力
    this.prisma.$on('query', (event) => {
      if (process.env.NODE_ENV === 'development') {
        logger.debug(`Query: ${event.query}`, {
          params: event.params,
          duration: event.duration,
        });
      }
    });

    // エラーログの出力
    this.prisma.$on('error', (event) => {
      logger.error('Prisma エラー:', event);
    });

    // 警告ログの出力
    this.prisma.$on('warn', (event) => {
      logger.warn('Prisma 警告:', event);
    });

    // 情報ログの出力
    this.prisma.$on('info', (event) => {
      logger.info('Prisma 情報:', event);
    });
  }

  /**
   * 接続状態を取得
   */
  public get connected(): boolean {
    return this.isConnected;
  }
}

// シングルトンインスタンスをエクスポート
export const databaseManager = DatabaseManager.getInstance();