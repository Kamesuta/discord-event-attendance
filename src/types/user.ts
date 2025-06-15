import { Prisma, User } from '@prisma/client';
import {
  GuildMember,
  APIGuildMember,
  User as DiscordUser,
  APIUser,
} from 'discord.js';

/**
 * ユーザーの統計情報を含む取得条件
 */
export const userIncludeStats = {
  include: {
    stats: {
      include: {
        event: true,
      },
    },
    voiceLogs: {
      include: {
        event: true,
      },
    },
  },
} as const;

/**
 * ユーザーに統計情報を含む型
 */
export type UserWithStats = Prisma.UserGetPayload<typeof userIncludeStats>;

/**
 * ユーザーの完全な情報を含む取得条件
 */
export const userIncludeFull = {
  include: {
    stats: {
      include: {
        event: true,
      },
    },
    voiceLogs: {
      include: {
        event: true,
      },
    },
    gameResults: {
      include: {
        event: true,
        game: true,
      },
    },
    hostedEvents: true,
  },
} as const;

/**
 * ユーザーの完全な情報を含む型
 */
export type UserWithFull = Prisma.UserGetPayload<typeof userIncludeFull>;

/**
 * Discord のメンバーまたはユーザー情報
 */
export type DiscordMemberOrUser =
  | GuildMember
  | APIGuildMember
  | DiscordUser
  | APIUser;

/**
 * ユーザー作成データ
 */
export interface UserCreateData {
  userId: string;
  username?: string;
  displayName?: string;
  memberName?: string;
  avatarURL?: string;
  memberAvatarURL?: string;
}

/**
 * ユーザー更新データ
 */
export interface UserUpdateData {
  username?: string;
  displayName?: string;
  memberName?: string;
  avatarURL?: string;
  memberAvatarURL?: string;
}

/**
 * ユーザー検索条件
 */
export interface UserSearchOptions {
  /** Discord ユーザーID */
  userId?: string;
  /** データベースユーザーID */
  id?: number;
  /** ユーザー名 */
  username?: string;
  /** 表示名 */
  displayName?: string;
}

/**
 * ユーザー統計データ
 */
export interface UserStatistics {
  totalEvents: number;
  totalDuration: number;
  averageDuration: number;
  recentEvents: number;
}