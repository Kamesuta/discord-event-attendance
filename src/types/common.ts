/**
 * APIレスポンスの基本型
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * ページネーション情報
 */
export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * ページネーション付きレスポンス
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: PaginationInfo;
}

/**
 * 並び順の指定
 */
export type SortOrder = 'asc' | 'desc';

/**
 * ページネーション条件
 */
export interface PaginationOptions {
  page?: number;
  limit?: number;
}

/**
 * 並び替え条件
 */
export interface SortOptions<T extends string> {
  sortBy?: T;
  sortOrder?: SortOrder;
}

/**
 * 検索条件の基本型
 */
export interface BaseSearchOptions extends PaginationOptions {
  query?: string;
}

/**
 * 日時範囲条件
 */
export interface DateRangeOptions {
  startDate?: Date;
  endDate?: Date;
}

/**
 * エラー情報
 */
export interface ErrorInfo {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * 操作結果
 */
export interface OperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: ErrorInfo;
}

/**
 * IDの型（文字列または数値）
 */
export type ID = string | number;

/**
 * オプショナルなフィールドを持つ型を作成
 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * 必須フィールドを持つ型を作成
 */
export type Required<T, K extends keyof T> = T & { [P in K]-?: T[P] };

/**
 * 特定のフィールドのみを選択する型を作成
 */
export type PickOptional<T, K extends keyof T> = Partial<Pick<T, K>>;

/**
 * ログレベル
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * ログエントリ
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, unknown>;
}