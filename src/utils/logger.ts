import log4js from 'log4js';
import { getWorkdirPath } from './workdir.js';
import { LogLevel, LogEntry } from '../types/common.js';

/**
 * 統一的なログ管理クラス
 */
export class Logger {
  private static instance: Logger;
  private log4jsLogger: log4js.Logger;
  private logHistory: LogEntry[] = [];
  private maxHistorySize = 1000;

  private constructor() {
    this.initializeLogger();
    this.log4jsLogger = log4js.getLogger('app');
  }

  /**
   * Logger のシングルトンインスタンスを取得
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * log4js の設定を初期化
   */
  private initializeLogger(): void {
    const logLevel = process.env.LOG_LEVEL || 'info';
    const logPath = getWorkdirPath('bot.log');

    log4js.configure({
      appenders: {
        file: {
          type: 'file',
          filename: logPath,
          maxLogSize: 10 * 1024 * 1024, // 10MB
          backups: 5,
          compress: true,
        },
        fileError: {
          type: 'file',
          filename: getWorkdirPath('error.log'),
          maxLogSize: 10 * 1024 * 1024, // 10MB
          backups: 3,
          compress: true,
        },
        errorFilter: {
          type: 'logLevelFilter',
          appender: 'fileError',
          level: 'error',
        },
        console: {
          type: 'console',
          layout: {
            type: 'pattern',
            pattern: '%d{yyyy-MM-dd hh:mm:ss} [%p] %c - %m',
          },
        },
      },
      categories: {
        default: {
          appenders: ['file', 'errorFilter', 'console'],
          level: logLevel,
        },
      },
    });
  }

  /**
   * ログエントリを履歴に追加
   */
  private addToHistory(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context,
    };

    this.logHistory.push(entry);

    // 履歴サイズの制限
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory = this.logHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * コンテキスト情報を文字列化
   */
  private formatContext(context?: Record<string, unknown>): string {
    if (!context || Object.keys(context).length === 0) {
      return '';
    }

    try {
      return ` | Context: ${JSON.stringify(context, null, 2)}`;
    } catch (error) {
      return ' | Context: [Circular Reference or Non-serializable]';
    }
  }

  /**
   * デバッグログを出力
   */
  public debug(message: string, context?: Record<string, unknown>): void {
    const formattedMessage = `${message}${this.formatContext(context)}`;
    this.log4jsLogger.debug(formattedMessage);
    this.addToHistory('debug', message, context);
  }

  /**
   * 情報ログを出力
   */
  public info(message: string, context?: Record<string, unknown>): void {
    const formattedMessage = `${message}${this.formatContext(context)}`;
    this.log4jsLogger.info(formattedMessage);
    this.addToHistory('info', message, context);
  }

  /**
   * 警告ログを出力
   */
  public warn(message: string, context?: Record<string, unknown>): void {
    const formattedMessage = `${message}${this.formatContext(context)}`;
    this.log4jsLogger.warn(formattedMessage);
    this.addToHistory('warn', message, context);
  }

  /**
   * エラーログを出力
   */
  public error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    let errorInfo = '';
    
    if (error instanceof Error) {
      errorInfo = ` | Error: ${error.name}: ${error.message}`;
      if (error.stack) {
        errorInfo += `\nStack: ${error.stack}`;
      }
    } else if (error) {
      errorInfo = ` | Error: ${String(error)}`;
    }

    const fullContext = {
      ...context,
      ...(error && { error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error }),
    };

    const formattedMessage = `${message}${errorInfo}${this.formatContext(context)}`;
    this.log4jsLogger.error(formattedMessage);
    this.addToHistory('error', message, fullContext);
  }

  /**
   * パフォーマンス測定を開始
   */
  public startTimer(label: string): () => void {
    const startTime = Date.now();
    
    this.debug(`Timer started: ${label}`);
    
    return () => {
      const duration = Date.now() - startTime;
      this.info(`Timer finished: ${label}`, { duration: `${duration}ms` });
    };
  }

  /**
   * 構造化ログを出力
   */
  public structured(
    level: LogLevel,
    event: string,
    data: Record<string, unknown>,
  ): void {
    const message = `Event: ${event}`;
    const context = { event, ...data };

    switch (level) {
      case 'debug':
        this.debug(message, context);
        break;
      case 'info':
        this.info(message, context);
        break;
      case 'warn':
        this.warn(message, context);
        break;
      case 'error':
        this.error(message, undefined, context);
        break;
    }
  }

  /**
   * ログ履歴を取得
   */
  public getHistory(level?: LogLevel, limit?: number): LogEntry[] {
    let history = this.logHistory;

    if (level) {
      history = history.filter(entry => entry.level === level);
    }

    if (limit && limit > 0) {
      history = history.slice(-limit);
    }

    return history;
  }

  /**
   * ログ統計を取得
   */
  public getStats(): Record<LogLevel, number> {
    const stats: Record<LogLevel, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    };

    this.logHistory.forEach(entry => {
      stats[entry.level]++;
    });

    return stats;
  }

  /**
   * ログ履歴をクリア
   */
  public clearHistory(): void {
    this.logHistory = [];
    this.info('ログ履歴をクリアしました');
  }

  /**
   * ログレベルを変更
   */
  public setLevel(level: LogLevel): void {
    this.log4jsLogger.level = level;
    this.info(`ログレベルを${level}に変更しました`);
  }

  /**
   * 現在のログレベルを取得
   */
  public getLevel(): string {
    return this.log4jsLogger.level.toString();
  }

  /**
   * ログ設定を取得
   */
  public getConfig(): {
    level: string;
    historySize: number;
    maxHistorySize: number;
  } {
    return {
      level: this.getLevel(),
      historySize: this.logHistory.length,
      maxHistorySize: this.maxHistorySize,
    };
  }

  /**
   * ログファイルパスを取得
   */
  public getLogFilePath(): string {
    return getWorkdirPath('bot.log');
  }

  /**
   * エラーログファイルパスを取得
   */
  public getErrorLogFilePath(): string {
    return getWorkdirPath('error.log');
  }
}

// シングルトンインスタンスをエクスポート
export const logger = Logger.getInstance();

// 後方互換性のため、既存のlog.tsと同じ形式でもエクスポート
export default logger;