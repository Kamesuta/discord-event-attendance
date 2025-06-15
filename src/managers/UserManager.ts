import { BaseManager } from './BaseManager.js';
import { UserRepository } from '../database/repositories/UserRepository.js';
import {
  UserWithStats,
  UserWithFull,
  UserCreateData,
  UserUpdateData,
  UserSearchOptions,
  UserStatistics,
  DiscordMemberOrUser,
} from '../types/user.js';
import { User } from '@prisma/client';
import { OperationResult } from '../types/common.js';
import { logger } from '../utils/log.js';

/**
 * ユーザー管理クラス
 * ユーザーの作成、更新、検索、統計情報の取得を管理
 */
export class UserManager extends BaseManager {
  private userRepository: UserRepository;

  constructor() {
    super();
    const prisma = this.getDatabaseManager().getClient();
    this.userRepository = new UserRepository(prisma);
  }

  protected getManagerName(): string {
    return 'UserManager';
  }

  protected async onInitialize(): Promise<void> {
    logger.info('UserManager初期化完了');
  }

  /**
   * ユーザーを作成または更新
   */
  public async createUser(userData: UserCreateData): Promise<OperationResult<User>> {
    return this.safeExecute(
      async () => {
        this.validateNotEmpty(userData.userId, 'userId');
        return await this.userRepository.upsertUser(userData);
      },
      'ユーザー作成',
      userData,
    );
  }

  /**
   * Discord のメンバー情報からユーザーを作成または取得
   */
  public async getOrCreateUser(
    memberOrUser: DiscordMemberOrUser,
  ): Promise<OperationResult<User>> {
    return this.safeExecute(
      async () => {
        return await this.userRepository.getOrCreateFromDiscordMember(memberOrUser);
      },
      'Discord メンバーからユーザー取得/作成',
    );
  }

  /**
   * Discord ユーザーIDでユーザーを取得
   */
  public async getUserByDiscordId(
    userId: string,
  ): Promise<OperationResult<User | null>> {
    return this.safeExecute(
      async () => {
        this.validateNotEmpty(userId, 'userId');
        return await this.userRepository.findByDiscordUserId(userId);
      },
      'Discord ユーザーID検索',
      { userId },
    );
  }

  /**
   * IDでユーザーを取得
   */
  public async getUserById(
    id: number,
  ): Promise<OperationResult<User | null>> {
    return this.safeExecute(
      async () => {
        this.validateRequired(id, 'id');
        return await this.userRepository.findById(id);
      },
      'ID検索',
      { id },
    );
  }

  /**
   * ユーザーを更新
   */
  public async updateUser(
    id: number,
    updateData: UserUpdateData,
  ): Promise<OperationResult<User>> {
    return this.safeExecute(
      async () => {
        this.validateRequired(id, 'id');
        return await this.userRepository.update(id, updateData);
      },
      'ユーザー更新',
      { id, updateData },
    );
  }

  /**
   * ユーザーを検索
   */
  public async searchUsers(
    options: UserSearchOptions,
  ): Promise<OperationResult<User[]>> {
    return this.safeExecute(
      async () => {
        return await this.userRepository.searchUsers(options);
      },
      'ユーザー検索',
      options,
    );
  }

  /**
   * 統計情報付きでユーザーを取得
   */
  public async getUserWithStats(
    id: number,
  ): Promise<OperationResult<UserWithStats | null>> {
    return this.safeExecute(
      async () => {
        this.validateRequired(id, 'id');
        return await this.userRepository.findWithStats(id);
      },
      '統計情報付きユーザー取得',
      { id },
    );
  }

  /**
   * 完全な情報付きでユーザーを取得
   */
  public async getUserWithFull(
    id: number,
  ): Promise<OperationResult<UserWithFull | null>> {
    return this.safeExecute(
      async () => {
        this.validateRequired(id, 'id');
        return await this.userRepository.findWithFull(id);
      },
      '完全な情報付きユーザー取得',
      { id },
    );
  }

  /**
   * ユーザーの統計情報を取得
   */
  public async getUserStatistics(
    userId: number,
  ): Promise<OperationResult<UserStatistics>> {
    return this.safeExecute(
      async () => {
        this.validateRequired(userId, 'userId');
        return await this.userRepository.getUserStatistics(userId);
      },
      'ユーザー統計取得',
      { userId },
    );
  }

  /**
   * 最近アクティブなユーザーを取得
   */
  public async getRecentActiveUsers(
    days = 30,
    limit = 50,
  ): Promise<OperationResult<User[]>> {
    return this.safeExecute(
      async () => {
        this.validateRange(days, 1, 365, 'days');
        this.validateRange(limit, 1, 1000, 'limit');
        return await this.userRepository.findRecentActiveUsers(days, limit);
      },
      '最近アクティブなユーザー取得',
      { days, limit },
    );
  }

  /**
   * ユーザーのイベント参加履歴を取得
   */
  public async getUserEventHistory(
    userId: number,
    options: {
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<OperationResult<{
    events: Array<{
      event: any;
      stat: any;
    }>;
    total: number;
  }>> {
    return this.safeExecute(
      async () => {
        this.validateRequired(userId, 'userId');
        
        const { limit = 20, offset = 0 } = options;
        this.validateRange(limit, 1, 100, 'limit');
        this.validateRange(offset, 0, 10000, 'offset');
        
        return await this.userRepository.getUserEventHistory(userId, {
          limit,
          offset,
        });
      },
      'ユーザーイベント履歴取得',
      { userId, options },
    );
  }

  /**
   * ユーザーの表示名を取得
   */
  public getUserName(user: User): string {
    return this.userRepository.getUserDisplayName(user);
  }

  /**
   * ユーザーのアバター画像URLを取得
   */
  public getUserAvatar(user: User): string | undefined {
    return this.userRepository.getUserAvatarURL(user);
  }

  /**
   * ユーザーが存在するかチェック
   */
  public async userExists(
    userId: string,
  ): Promise<OperationResult<boolean>> {
    return this.safeExecute(
      async () => {
        this.validateNotEmpty(userId, 'userId');
        return await this.userRepository.exists({ userId });
      },
      'ユーザー存在チェック',
      { userId },
    );
  }

  /**
   * 複数のユーザーを一括作成
   */
  public async createMultipleUsers(
    usersData: UserCreateData[],
  ): Promise<OperationResult<{ count: number }>> {
    return this.safeExecute(
      async () => {
        this.validateRequired(usersData, 'usersData');
        this.validate(
          usersData,
          (data) => Array.isArray(data) && data.length > 0,
          'usersDataは空でない配列である必要があります',
        );
        
        // 各ユーザーデータの検証
        usersData.forEach((userData, index) => {
          this.validateNotEmpty(userData.userId, `usersData[${index}].userId`);
        });

        return await this.userRepository.createMany(usersData);
      },
      'ユーザー一括作成',
      { count: usersData.length },
    );
  }

  /**
   * ユーザー統計の概要を取得
   */
  public async getUsersOverview(): Promise<OperationResult<{
    totalUsers: number;
    activeUsers: number;
    newUsersThisMonth: number;
  }>> {
    return this.safeExecute(
      async () => {
        const [totalUsers, activeUsers, newUsersThisMonth] = await Promise.all([
          this.userRepository.count(),
          this.userRepository.findRecentActiveUsers(30).then(users => users.length),
          this.userRepository.count({
            createdAt: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          }),
        ]);

        return {
          totalUsers,
          activeUsers,
          newUsersThisMonth,
        };
      },
      'ユーザー統計概要取得',
    );
  }

  /**
   * パフォーマンス統計を取得
   */
  protected async onGetPerformanceStats(): Promise<Record<string, unknown>> {
    const totalUsers = await this.userRepository.count();
    const activeUsers = await this.userRepository.findRecentActiveUsers(7);
    
    return {
      totalUsers,
      activeUsersLastWeek: activeUsers.length,
    };
  }
}

// シングルトンインスタンスをエクスポート
export const userManager = new UserManager();