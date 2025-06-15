import { PrismaClient, Prisma } from '@prisma/client';
import { PaginationOptions, SortOptions, OperationResult } from './common.js';

/**
 * データベース接続設定
 */
export interface DatabaseConfig {
  url: string;
  shadowDatabaseUrl?: string;
  logLevel?: 'info' | 'query' | 'warn' | 'error';
}

/**
 * トランザクション関数の型
 */
export type TransactionFunction<T> = (
  prisma: Omit<
    PrismaClient,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'
  >,
) => Promise<T>;

/**
 * Repository の基本インターフェース
 */
export interface BaseRepository<T, CreateInput, UpdateInput, WhereInput> {
  /**
   * エンティティを作成
   */
  create(data: CreateInput): Promise<T>;

  /**
   * エンティティを更新
   */
  update(id: number, data: UpdateInput): Promise<T>;

  /**
   * エンティティを削除
   */
  delete(id: number): Promise<void>;

  /**
   * IDでエンティティを取得
   */
  findById(id: number): Promise<T | null>;

  /**
   * 条件でエンティティを検索
   */
  findMany(options: FindManyOptions<WhereInput>): Promise<T[]>;

  /**
   * 条件で最初のエンティティを取得
   */
  findFirst(where: WhereInput): Promise<T | null>;

  /**
   * エンティティの総数を取得
   */
  count(where?: WhereInput): Promise<number>;

  /**
   * エンティティが存在するかチェック
   */
  exists(where: WhereInput): Promise<boolean>;
}

/**
 * 検索オプション
 */
export interface FindManyOptions<WhereInput>
  extends PaginationOptions,
    SortOptions<string> {
  where?: WhereInput;
  include?: Record<string, unknown>;
  select?: Record<string, unknown>;
}

/**
 * Upsert オプション
 */
export interface UpsertOptions<WhereUniqueInput, CreateInput, UpdateInput> {
  where: WhereUniqueInput;
  create: CreateInput;
  update: UpdateInput;
}

/**
 * データベース操作の結果型
 */
export type DatabaseOperationResult<T = unknown> = OperationResult<T>;

/**
 * トランザクション内でのエラー
 */
export class TransactionError extends Error {
  constructor(
    message: string,
    public cause?: Error,
  ) {
    super(message);
    this.name = 'TransactionError';
  }
}

/**
 * データベース接続エラー
 */
export class DatabaseConnectionError extends Error {
  constructor(
    message: string,
    public cause?: Error,
  ) {
    super(message);
    this.name = 'DatabaseConnectionError';
  }
}

/**
 * エンティティが見つからないエラー
 */
export class EntityNotFoundError extends Error {
  constructor(
    entityName: string,
    identifier: string | number,
  ) {
    super(`${entityName} with identifier ${identifier} not found`);
    this.name = 'EntityNotFoundError';
  }
}

/**
 * バリデーションエラー
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public value?: unknown,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * データベース制約エラー
 */
export class ConstraintError extends Error {
  constructor(
    message: string,
    public constraintName?: string,
  ) {
    super(message);
    this.name = 'ConstraintError';
  }
}