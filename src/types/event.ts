import { Event, Prisma, User } from '@prisma/client';
import { GuildScheduledEventStatus } from 'discord.js';

/**
 * イベントの取得条件（ホスト情報を含む）
 */
export const eventIncludeHost = {
  include: {
    host: true,
  },
} as const;

/**
 * イベントにホストを含む型
 */
export type EventWithHost = Prisma.EventGetPayload<typeof eventIncludeHost>;

/**
 * イベントの統計情報を含む取得条件
 */
export const eventIncludeStats = {
  include: {
    host: true,
    stats: {
      include: {
        user: true,
      },
    },
    voiceLogs: {
      include: {
        user: true,
      },
    },
  },
} as const;

/**
 * イベントに統計情報を含む型
 */
export type EventWithStats = Prisma.EventGetPayload<typeof eventIncludeStats>;

/**
 * イベントの完全な情報を含む取得条件
 */
export const eventIncludeFull = {
  include: {
    host: true,
    stats: {
      include: {
        user: true,
      },
    },
    voiceLogs: {
      include: {
        user: true,
      },
    },
    games: {
      include: {
        users: {
          include: {
            user: true,
          },
        },
      },
    },
  },
} as const;

/**
 * イベントの完全な情報を含む型
 */
export type EventWithFull = Prisma.EventGetPayload<typeof eventIncludeFull>;

/**
 * イベント検索条件
 */
export interface EventSearchOptions {
  /** Discord イベントID */
  eventId?: string;
  /** データベースイベントID */
  id?: number;
  /** チャンネルID */
  channelId?: string;
  /** イベントの状態 */
  active?: GuildScheduledEventStatus;
  /** 時間の範囲（ミリ秒） */
  timeMargin?: number;
}

/**
 * イベント作成データ
 */
export interface EventCreateData {
  eventId: string;
  name: string;
  channelId: string;
  description?: string;
  coverImage?: string;
  hostId?: number;
  messageId?: string;
  scheduleTime?: Date;
}

/**
 * イベント更新データ
 */
export interface EventUpdateData {
  name?: string;
  description?: string;
  coverImage?: string;
  hostId?: number;
  messageId?: string;
  active?: GuildScheduledEventStatus;
  startTime?: Date;
  endTime?: Date;
}

/**
 * イベント統計データ
 */
export interface EventStatistics {
  totalParticipants: number;
  totalDuration: number;
  averageDuration: number;
  peakParticipants: number;
}