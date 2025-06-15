import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/log.js';
import {
  BaseRepository,
  FindManyOptions,
  UpsertOptions,
  EntityNotFoundError,
  ValidationError,
} from '../../types/database.js';

/**
 * Repository の基底クラス
 * 共通のデータベース操作メソッドを実装
 */
export abstract class AbstractBaseRepository<
  T,
  CreateInput,
  UpdateInput,
  WhereInput,
  WhereUniqueInput = { id: number },
> implements BaseRepository<T, CreateInput, UpdateInput, WhereInput>
{
  protected prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * モデル名を取得（ログ出力等で使用）
   */
  protected abstract getModelName(): string;

  /**
   * Prisma のモデルデリゲートを取得
   */
  protected abstract getModel(): any;

  /**
   * エンティティを作成
   */
  public async create(data: CreateInput): Promise<T> {
    try {
      logger.debug(`${this.getModelName()}を作成中:`, data);
      const result = await this.getModel().create({ data });
      logger.info(`${this.getModelName()}を作成しました:`, { id: result.id });
      return result;
    } catch (error) {
      logger.error(`${this.getModelName()}の作成に失敗:`, error);
      throw this.handleError(error);
    }
  }

  /**
   * エンティティを更新
   */
  public async update(id: number, data: UpdateInput): Promise<T> {
    try {
      logger.debug(`${this.getModelName()}を更新中:`, { id, data });
      const result = await this.getModel().update({
        where: { id },
        data,
      });
      logger.info(`${this.getModelName()}を更新しました:`, { id });
      return result;
    } catch (error) {
      logger.error(`${this.getModelName()}の更新に失敗:`, { id, error });
      throw this.handleError(error);
    }
  }

  /**
   * エンティティを削除
   */
  public async delete(id: number): Promise<void> {
    try {
      logger.debug(`${this.getModelName()}を削除中:`, { id });
      await this.getModel().delete({
        where: { id },
      });
      logger.info(`${this.getModelName()}を削除しました:`, { id });
    } catch (error) {
      logger.error(`${this.getModelName()}の削除に失敗:`, { id, error });
      throw this.handleError(error);
    }
  }

  /**
   * IDでエンティティを取得
   */
  public async findById(id: number): Promise<T | null> {
    try {
      logger.debug(`${this.getModelName()}をIDで検索中:`, { id });
      const result = await this.getModel().findUnique({
        where: { id },
      });
      return result;
    } catch (error) {
      logger.error(`${this.getModelName()}のID検索に失敗:`, { id, error });
      throw this.handleError(error);
    }
  }

  /**
   * 条件でエンティティを検索
   */
  public async findMany(options: FindManyOptions<WhereInput>): Promise<T[]> {
    try {
      logger.debug(`${this.getModelName()}を検索中:`, options);
      
      const { where, include, select, page, limit, sortBy, sortOrder } = options;
      
      // ページネーション
      const skip = page && limit ? (page - 1) * limit : undefined;
      const take = limit;
      
      // 並び替え
      const orderBy = sortBy
        ? { [sortBy]: sortOrder || 'asc' }
        : undefined;

      const result = await this.getModel().findMany({
        where,
        include,
        select,
        skip,
        take,
        orderBy,
      });

      logger.debug(`${this.getModelName()}の検索結果:`, { count: result.length });
      return result;
    } catch (error) {
      logger.error(`${this.getModelName()}の検索に失敗:`, { options, error });
      throw this.handleError(error);
    }
  }

  /**
   * 条件で最初のエンティティを取得
   */
  public async findFirst(where: WhereInput): Promise<T | null> {
    try {
      logger.debug(`${this.getModelName()}を最初の1件検索中:`, where);
      const result = await this.getModel().findFirst({
        where,
      });
      return result;
    } catch (error) {
      logger.error(`${this.getModelName()}の最初の1件検索に失敗:`, { where, error });
      throw this.handleError(error);
    }
  }

  /**
   * エンティティの総数を取得
   */
  public async count(where?: WhereInput): Promise<number> {
    try {
      logger.debug(`${this.getModelName()}の件数を取得中:`, where);
      const result = await this.getModel().count({
        where,
      });
      return result;
    } catch (error) {
      logger.error(`${this.getModelName()}の件数取得に失敗:`, { where, error });
      throw this.handleError(error);
    }
  }

  /**
   * エンティティが存在するかチェック
   */
  public async exists(where: WhereInput): Promise<boolean> {
    try {
      const count = await this.count(where);
      return count > 0;
    } catch (error) {
      logger.error(`${this.getModelName()}の存在チェックに失敗:`, { where, error });
      throw this.handleError(error);
    }
  }

  /**
   * エンティティを作成または更新
   */
  public async upsert(
    options: UpsertOptions<WhereUniqueInput, CreateInput, UpdateInput>,
  ): Promise<T> {
    try {
      logger.debug(`${this.getModelName()}をUpsert中:`, options);
      const result = await this.getModel().upsert(options);
      logger.info(`${this.getModelName()}をUpsertしました:`, { id: result.id });
      return result;
    } catch (error) {
      logger.error(`${this.getModelName()}のUpsertに失敗:`, { options, error });
      throw this.handleError(error);
    }
  }

  /**
   * 複数のエンティティを一括作成
   */
  public async createMany(data: CreateInput[]): Promise<{ count: number }> {
    try {
      logger.debug(`${this.getModelName()}を一括作成中:`, { count: data.length });
      const result = await this.getModel().createMany({ data });
      logger.info(`${this.getModelName()}を一括作成しました:`, result);
      return result;
    } catch (error) {
      logger.error(`${this.getModelName()}の一括作成に失敗:`, { count: data.length, error });
      throw this.handleError(error);
    }
  }

  /**
   * 複数のエンティティを一括更新
   */
  public async updateMany(
    where: WhereInput,
    data: Partial<UpdateInput>,
  ): Promise<{ count: number }> {
    try {
      logger.debug(`${this.getModelName()}を一括更新中:`, { where, data });
      const result = await this.getModel().updateMany({ where, data });
      logger.info(`${this.getModelName()}を一括更新しました:`, result);
      return result;
    } catch (error) {
      logger.error(`${this.getModelName()}の一括更新に失敗:`, { where, data, error });
      throw this.handleError(error);
    }
  }

  /**
   * 複数のエンティティを一括削除
   */
  public async deleteMany(where: WhereInput): Promise<{ count: number }> {
    try {
      logger.debug(`${this.getModelName()}を一括削除中:`, where);
      const result = await this.getModel().deleteMany({ where });
      logger.info(`${this.getModelName()}を一括削除しました:`, result);
      return result;
    } catch (error) {
      logger.error(`${this.getModelName()}の一括削除に失敗:`, { where, error });
      throw this.handleError(error);
    }
  }

  /**
   * エラーハンドリング
   */
  protected handleError(error: any): Error {
    if (error.code === 'P2025') {
      // Record not found
      return new EntityNotFoundError(this.getModelName(), 'unknown');
    }
    
    if (error.code === 'P2002') {
      // Unique constraint violation
      return new ValidationError(
        `${this.getModelName()}の一意制約違反です`,
        error.meta?.target?.[0],
      );
    }
    
    if (error.code === 'P2003') {
      // Foreign key constraint violation
      return new ValidationError(
        `${this.getModelName()}の外部キー制約違反です`,
        error.meta?.field_name,
      );
    }
    
    // その他のエラーはそのまま返す
    return error;
  }
}