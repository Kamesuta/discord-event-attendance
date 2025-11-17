import { z } from 'zod';
import { createMCPJSONResult, MCPToolResult } from '../types.js';
import { eventManager } from '../../domain/services/EventManager.js';
import { GuildScheduledEventStatus } from 'discord.js';
import { prisma } from '../../utils/prisma.js';

/**
 * get-event-statusツールの定義
 */
export const getEventStatusTool = {
  name: 'get-event-status',
  description: 'イベントの出欠状況を取得',
  inputSchema: {
    type: 'object' as const,
    properties: {
      eventId: {
        type: 'number' as const,
        description: 'イベントID（省略時は最新のイベント）',
      },
    },
  },
};

/**
 * get-event-statusのスキーマ
 */
const getEventStatusSchema = z.object({
  eventId: z.number().optional(),
});

/**
 * イベントの出欠状況を取得
 * @param args 引数
 * @returns MCPツールの結果
 */
export async function getEventStatus(args: unknown): Promise<MCPToolResult> {
  const { eventId } = getEventStatusSchema.parse(args);

  // イベントを取得
  const event = await eventManager.getEventFromId(eventId);
  if (!event) {
    throw new Error('イベントが見つかりませんでした');
  }

  // 参加者統計を取得
  const stats = await prisma.userStat.findMany({
    where: {
      eventId: event.id,
      show: true,
    },
    include: {
      user: true,
    },
    orderBy: {
      duration: 'desc',
    },
  });

  // 参加者の参加回数を取得
  const userIds = stats.map((stat) => stat.userId);
  const userCounts = await Promise.all(
    userIds.map(async (userId) => {
      const count = await prisma.userStat.count({
        where: {
          userId,
          show: true,
          event: {
            active: GuildScheduledEventStatus.Completed,
          },
        },
      });
      return { userId, count };
    }),
  );
  const userCountMap = Object.fromEntries(
    userCounts.map(({ userId, count }) => [userId, count]),
  );

  // ユーザーごとのXP合計を取得
  const userXp = await Promise.all(
    stats.map(async (stat) => {
      const xp = await prisma.userGameResult.aggregate({
        where: {
          eventId: event.id,
          userId: stat.userId,
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention
        _sum: {
          xp: true,
        },
      });
      return {
        userId: stat.userId,
        xp: xp._sum.xp ?? 0,
      };
    }),
  );
  const userXpMap = Object.fromEntries(
    userXp.map(({ userId, xp }) => [userId, xp]),
  );

  // 試合結果を取得
  const gameResults = await prisma.gameResult.findMany({
    where: {
      eventId: event.id,
    },
    include: {
      users: {
        include: {
          user: true,
        },
        orderBy: {
          rank: 'asc',
        },
      },
    },
  });

  // レスポンスデータを構築
  const response = {
    event: {
      id: event.id,
      eventId: event.eventId,
      name: event.name,
      description: event.description,
      scheduleTime: event.scheduleTime?.toISOString(),
      startTime: event.startTime?.toISOString(),
      endTime: event.endTime?.toISOString(),
      active: event.active,
      channelId: event.channelId,
      host: event.host
        ? {
            id: event.host.id,
            userId: event.host.userId,
            username: event.host.username,
            displayName: event.host.displayName,
            memberName: event.host.memberName,
          }
        : null,
    },
    participants: stats.map((stat) => ({
      user: {
        id: stat.user.id,
        userId: stat.user.userId,
        username: stat.user.username,
        displayName: stat.user.displayName,
        memberName: stat.user.memberName,
      },
      duration: stat.duration,
      memo: stat.memo,
      participationCount: userCountMap[stat.userId] || 0,
      xp: userXpMap[stat.userId] || 0,
      isFirstTime: userCountMap[stat.userId] === 1,
    })),
    games: gameResults.map((game) => ({
      id: game.id,
      name: game.name,
      url: game.url,
      image: game.image,
      results: game.users.map((result) => ({
        user: {
          id: result.user.id,
          userId: result.user.userId,
          username: result.user.username,
          displayName: result.user.displayName,
          memberName: result.user.memberName,
        },
        rank: result.rank,
        xp: result.xp,
        group: result.group,
      })),
    })),
    summary: {
      totalParticipants: stats.length,
      totalGames: gameResults.length,
      totalXP: Object.values(userXpMap).reduce((sum, xp) => sum + xp, 0),
      firstTimeParticipants: Object.values(userCountMap).filter(
        (count) => count === 1,
      ).length,
    },
  };

  return createMCPJSONResult(response);
}
