import { z } from 'zod';
import { createMCPJSONResult, MCPToolResult } from '../types.js';
import { GuildScheduledEventStatus } from 'discord.js';
import { prisma } from '../../utils/prisma.js';

/**
 * get-user-statusツールの定義
 */
export const getUserStatusTool = {
  name: 'get-user-status',
  description: 'ユーザーの過去のイベント参加状況を取得',
  inputSchema: {
    type: 'object' as const,
    properties: {
      userId: {
        type: 'string' as const,
        description: 'DiscordユーザーID',
      },
      page: {
        type: 'number' as const,
        minimum: 1,
        description: 'ページ番号',
      },
    },
    required: ['userId'],
  },
};

/**
 * get-user-statusのスキーマ
 */
const getUserStatusSchema = z.object({
  userId: z.string(),
  page: z.number().min(1).optional(),
});

/**
 * ユーザーの過去のイベント参加状況を取得
 * @param args 引数
 * @returns MCPツールの結果
 */
export async function getUserStatus(args: unknown): Promise<MCPToolResult> {
  const { userId, page = 1 } = getUserStatusSchema.parse(args);

  // ユーザーを取得
  const user = await prisma.user.findUnique({
    where: {
      userId,
    },
    include: {
      hostedEvents: {
        where: {
          active: GuildScheduledEventStatus.Completed,
        },
        include: {
          stats: {
            where: {
              show: true,
            },
          },
          games: true,
        },
        orderBy: {
          startTime: 'desc',
        },
      },
      stats: {
        where: {
          show: true,
          event: {
            active: GuildScheduledEventStatus.Completed,
          },
        },
        include: {
          event: {
            include: {
              stats: {
                where: {
                  show: true,
                },
              },
              games: true,
            },
          },
        },
        orderBy: {
          event: {
            startTime: 'desc',
          },
        },
      },
    },
  });

  if (!user) {
    throw new Error('ユーザーが見つかりませんでした');
  }

  // 全イベント数を取得
  const eventCount = await prisma.event.count({
    where: {
      endTime: {
        not: null,
      },
    },
  });

  // 参加率ランキング順位 (直近30日間)
  const ranking = await prisma.userStat.groupBy({
    by: ['userId'],
    where: {
      show: true,
      event: {
        startTime: {
          gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _count: true,
  });

  const rank =
    ranking
      .sort((a, b) => b._count - a._count)
      .findIndex((r) => r.userId === user.id) + 1;

  const rankSymbols = ['', '👑', '🥈', '🥉'];
  const rankText = rank
    ? `${rankSymbols[rank] ?? ''}${rank}位/${ranking.length}人`
    : '参加なし';

  // ページング処理
  const itemsPerPage = 10;
  const allEvents = [...user.stats, ...user.hostedEvents];
  const totalPages = Math.ceil(allEvents.length / itemsPerPage);
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;

  // 主催イベントと参加イベントを分けてページング
  const hostedEvents = user.hostedEvents.slice(
    Math.max(0, startIndex - user.stats.length),
    Math.max(0, endIndex - user.stats.length),
  );
  const participatedEvents = user.stats.slice(
    Math.max(0, startIndex),
    Math.max(0, Math.min(endIndex, user.stats.length)),
  );

  // レスポンスデータを構築
  const response = {
    user: {
      id: user.id,
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      memberName: user.memberName,
      avatarURL: user.avatarURL,
      memberAvatarURL: user.memberAvatarURL,
    },
    statistics: {
      participatedEventCount: user.stats.length,
      hostedEventCount: user.hostedEvents.length,
      totalEventCount: eventCount,
      participationRate: Math.round((user.stats.length / eventCount) * 100),
      ranking: {
        rank: rank || null,
        total: ranking.length,
        text: rankText,
        period: '直近30日間',
      },
    },
    participatedEvents: participatedEvents.map((stat) => ({
      event: {
        id: stat.event.id,
        eventId: stat.event.eventId,
        name: stat.event.name,
        startTime: stat.event.startTime?.toISOString(),
        endTime: stat.event.endTime?.toISOString(),
        participantCount: stat.event.stats.length,
        gameCount: stat.event.games.length,
      },
      duration: stat.duration,
      memo: stat.memo,
    })),
    hostedEvents: hostedEvents.map((event) => ({
      id: event.id,
      eventId: event.eventId,
      name: event.name,
      startTime: event.startTime?.toISOString(),
      endTime: event.endTime?.toISOString(),
      participantCount: event.stats.length,
      gameCount: event.games.length,
    })),
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: allEvents.length,
      itemsPerPage,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    },
  };

  return createMCPJSONResult(response);
}
