import { User, Prisma } from '@prisma/client';
import { AbstractBaseRepository } from './BaseRepository.js';
import {
  UserWithStats,
  UserWithFull,
  UserCreateData,
  UserUpdateData,
  UserSearchOptions,
  UserStatistics,
  DiscordMemberOrUser,
  userIncludeStats,
  userIncludeFull,
} from '../../types/user.js';
import { logger } from '../../utils/log.js';

/**
 * ユーザーのRepositoryクラス
 * ユーザー固有のデータベース操作を提供
 */
export class UserRepository extends AbstractBaseRepository<
  User,
  Prisma.UserCreateInput,
  Prisma.UserUpdateInput,
  Prisma.UserWhereInput,
  Prisma.UserWhereUniqueInput
> {
  protected getModelName(): string {
    return 'User';
  }

  protected getModel() {
    return this.prisma.user;
  }

  /**
   * Discord ユーザーIDでユーザーを取得
   */
  public async findByDiscordUserId(userId: string): Promise<User | null> {
    try {
      logger.debug('Discord ユーザーIDでユーザーを検索中:', { userId });
      
      const user = await this.prisma.user.findUnique({
        where: {
          userId,
        },
      });

      if (user) {
        logger.debug('ユーザーを発見:', { id: user.id, userId });
      }

      return user;
    } catch (error) {
      logger.error('Discord ユーザーIDでの検索に失敗:', { userId, error });
      throw this.handleError(error);
    }
  }

  /**
   * ユーザーを作成または更新（upsert）
   */
  public async upsertUser(userData: UserCreateData): Promise<User> {
    try {
      logger.debug('ユーザーをUpsert中:', userData);
      
      const user = await this.prisma.user.upsert({
        where: {
          userId: userData.userId,
        },
        update: {
          username: userData.username,
          displayName: userData.displayName,
          memberName: userData.memberName,
          avatarURL: userData.avatarURL,
          memberAvatarURL: userData.memberAvatarURL,
        },
        create: userData,
      });

      logger.info('ユーザーをUpsertしました:', { id: user.id, userId: user.userId });
      return user;
    } catch (error) {
      logger.error('ユーザーのUpsertに失敗:', { userData, error });
      throw this.handleError(error);
    }
  }

  /**
   * Discord のメンバー情報からユーザーを作成または取得
   */
  public async getOrCreateFromDiscordMember(
    memberOrUser: DiscordMemberOrUser,
  ): Promise<User> {
    try {
      const user = 'user' in memberOrUser ? memberOrUser.user : memberOrUser;
      const member = 'user' in memberOrUser ? memberOrUser : undefined;

      logger.debug('Discord メンバーからユーザーを取得/作成中:', { userId: user.id });

      const userData: UserCreateData = {
        userId: user.id,
        username: user.username,
        displayName: 'displayName' in user ? user.displayName : user.global_name,
        memberName: member
          ? 'displayName' in member
            ? member.displayName
            : member.nick
          : undefined,
        avatarURL:
          'displayAvatarURL' in user ? user.displayAvatarURL() : user.avatar,
        memberAvatarURL: member
          ? 'displayAvatarURL' in member
            ? member.displayAvatarURL()
            : member.avatar
          : undefined,
      };

      return await this.upsertUser(userData);
    } catch (error) {
      logger.error('Discord メンバーからのユーザー取得/作成に失敗:', error);
      throw this.handleError(error);
    }
  }

  /**
   * 統計情報付きでユーザーを取得
   */
  public async findWithStats(id: number): Promise<UserWithStats | null> {
    try {
      logger.debug('統計情報付きでユーザーを取得中:', { id });
      
      const user = await this.prisma.user.findUnique({
        where: { id },
        ...userIncludeStats,
      });

      return user;
    } catch (error) {
      logger.error('統計情報付きユーザー取得に失敗:', { id, error });
      throw this.handleError(error);
    }
  }

  /**
   * 完全な情報付きでユーザーを取得
   */
  public async findWithFull(id: number): Promise<UserWithFull | null> {
    try {
      logger.debug('完全な情報付きでユーザーを取得中:', { id });
      
      const user = await this.prisma.user.findUnique({
        where: { id },
        ...userIncludeFull,
      });

      return user;
    } catch (error) {
      logger.error('完全な情報付きユーザー取得に失敗:', { id, error });
      throw this.handleError(error);
    }
  }

  /**
   * 高度な検索条件でユーザーを検索
   */
  public async searchUsers(options: UserSearchOptions): Promise<User[]> {
    try {
      logger.debug('高度な検索条件でユーザーを検索中:', options);
      
      const { userId, username, displayName } = options;
      
      const where: Prisma.UserWhereInput = {};
      
      if (userId) {
        where.userId = userId;
      }
      
      if (username) {
        where.username = {
          contains: username,
          mode: 'insensitive',
        };
      }
      
      if (displayName) {
        where.OR = [
          {
            displayName: {
              contains: displayName,
              mode: 'insensitive',
            },
          },
          {
            memberName: {
              contains: displayName,
              mode: 'insensitive',
            },
          },
        ];
      }

      const users = await this.prisma.user.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
      });

      logger.debug('ユーザー検索結果:', { count: users.length });
      return users;
    } catch (error) {
      logger.error('高度なユーザー検索に失敗:', { options, error });
      throw this.handleError(error);
    }
  }

  /**
   * ユーザーの統計情報を計算
   */
  public async getUserStatistics(userId: number): Promise<UserStatistics> {
    try {
      logger.debug('ユーザーの統計情報を計算中:', { userId });
      
      const [user, stats] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: userId } }),
        this.prisma.userStat.findMany({
          where: { userId },
          include: {
            event: true,
          },
        }),
      ]);

      if (!user) {
        throw new Error(`User with ID ${userId} not found`);
      }

      const totalEvents = stats.length;
      const totalDuration = stats.reduce((sum, stat) => sum + stat.duration, 0);
      const averageDuration = totalEvents > 0 ? totalDuration / totalEvents : 0;

      // 最近のイベント（過去30日）
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentEvents = stats.filter(stat => 
        stat.event.startTime && stat.event.startTime > thirtyDaysAgo
      ).length;

      const statistics: UserStatistics = {
        totalEvents,
        totalDuration,
        averageDuration,
        recentEvents,
      };

      logger.debug('ユーザー統計情報を計算完了:', statistics);
      return statistics;
    } catch (error) {
      logger.error('ユーザー統計情報の計算に失敗:', { userId, error });
      throw this.handleError(error);
    }
  }

  /**
   * 最近アクティブなユーザーを取得
   */
  public async findRecentActiveUsers(days = 30, limit = 50): Promise<User[]> {
    try {
      logger.debug('最近アクティブなユーザーを取得中:', { days, limit });
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const users = await this.prisma.user.findMany({
        where: {
          stats: {
            some: {
              event: {
                startTime: {
                  gte: cutoffDate,
                },
              },
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: limit,
      });

      logger.debug('最近アクティブなユーザー取得結果:', { count: users.length });
      return users;
    } catch (error) {
      logger.error('最近アクティブなユーザーの取得に失敗:', { days, limit, error });
      throw this.handleError(error);
    }
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
  ): Promise<{
    events: Array<{
      event: any;
      stat: any;
    }>;
    total: number;
  }> {
    try {
      const { limit = 20, offset = 0 } = options;
      
      logger.debug('ユーザーのイベント参加履歴を取得中:', { userId, options });

      const [stats, total] = await Promise.all([
        this.prisma.userStat.findMany({
          where: { userId },
          include: {
            event: {
              include: {
                host: true,
              },
            },
          },
          orderBy: {
            event: {
              startTime: 'desc',
            },
          },
          take: limit,
          skip: offset,
        }),
        this.prisma.userStat.count({
          where: { userId },
        }),
      ]);

      const events = stats.map(stat => ({
        event: stat.event,
        stat: {
          duration: stat.duration,
          show: stat.show,
          memo: stat.memo,
        },
      }));

      logger.debug('ユーザーのイベント参加履歴取得完了:', { count: events.length, total });
      return { events, total };
    } catch (error) {
      logger.error('ユーザーのイベント参加履歴取得に失敗:', { userId, options, error });
      throw this.handleError(error);
    }
  }

  /**
   * ユーザーの表示名を取得
   */
  public getUserDisplayName(user: User): string {
    return (
      user.memberName ??
      user.displayName ??
      user.username ??
      `<@${user.userId}>`
    );
  }

  /**
   * ユーザーのアバター画像URLを取得
   */
  public getUserAvatarURL(user: User): string | undefined {
    return user.memberAvatarURL ?? user.avatarURL ?? undefined;
  }
}