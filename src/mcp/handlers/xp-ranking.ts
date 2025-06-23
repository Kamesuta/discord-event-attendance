import { z } from 'zod';
import { createMCPJSONResult, MCPToolResult } from '../types.js';
import { parsePeriod } from '../../event/periodParser.js';
import { prisma } from '../../utils/prisma.js';

/**
 * get-xp-rankingツールの定義
 */
export const getXpRankingTool = {
  name: 'get-xp-ranking',
  description: 'XP合計ランキングを取得',
  inputSchema: {
    type: 'object' as const,
    properties: {
      period: {
        type: 'string' as const,
        description:
          '期間指定（例：3-5=3月〜5月、2023/3=2023年3月、8/5=今年8月5日）',
      },
      search: {
        type: 'string' as const,
        description: 'イベント名検索（空白区切りでAND検索、OR区切りでOR検索）',
      },
      maxCount: {
        type: 'number' as const,
        description: '1ページあたりの最大表示件数（省略時は20）',
      },
      page: {
        type: 'number' as const,
        minimum: 1,
        description: 'ページ番号',
      },
    },
  },
};
import { parseSearch } from '../../event/searchParser.js';
import { GuildScheduledEventStatus } from 'discord.js';

const getXpRankingSchema = z.object({
  period: z.string().optional(),
  search: z.string().optional(),
  maxCount: z.number().optional(),
  page: z.number().min(1).optional(),
});

/**
 * ゲームXP合計ランキングを取得
 * @param args 引数
 * @returns MCPツールの結果
 */
export async function getXpRanking(args: unknown): Promise<MCPToolResult> {
  const {
    period: periodOption,
    search,
    maxCount = 20,
    page = 1,
  } = getXpRankingSchema.parse(args);

  const period = parsePeriod(periodOption);
  const nameCondition = parseSearch(search);

  // XPランキングを集計
  const ranking = await prisma.userGameResult.groupBy({
    by: ['userId'],
    where: {
      event: {
        startTime: period.period,
        active: GuildScheduledEventStatus.Completed,
        ...nameCondition,
      },
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _sum: {
      xp: true,
    },
  });

  // ユーザー情報を取得
  const userIds = ranking.map((r) => r.userId);
  const users = await prisma.user.findMany({
    where: {
      id: { in: userIds },
    },
  });

  // ランキングとユーザー情報を結合
  const rankingWithUser = ranking
    .filter((r) => r._sum.xp && r._sum.xp > 0)
    .map((r) => {
      const user = users.find((u) => u.id === r.userId);
      return {
        userId: user?.userId || '',
        username: user?.username || null,
        displayName: user?.displayName || null,
        memberName: user?.memberName || null,
        totalXp: r._sum.xp || 0,
      };
    })
    .sort((a, b) => b.totalXp - a.totalXp);

  // ページング処理
  const itemsPerPage = maxCount || rankingWithUser.length;
  const totalPages = Math.ceil(rankingWithUser.length / itemsPerPage);
  const startIndex = (page - 1) * itemsPerPage;
  const pagedRanking = rankingWithUser.slice(
    startIndex,
    startIndex + itemsPerPage,
  );

  // 統計情報を取得
  const totalXp = rankingWithUser.reduce((sum, item) => sum + item.totalXp, 0);
  const averageXp =
    rankingWithUser.length > 0 ? totalXp / rankingWithUser.length : 0;

  const response = {
    ranking: pagedRanking.map((item, index) => ({
      rank: startIndex + index + 1,
      user: {
        userId: item.userId,
        username: item.username,
        displayName: item.displayName,
        memberName: item.memberName,
      },
      totalXP: item.totalXp,
      averageXPPercentage:
        averageXp > 0 ? Math.round((item.totalXp / averageXp) * 100) : 0,
    })),
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: rankingWithUser.length,
      itemsPerPage,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    },
    filter: {
      period: period.text,
      search: search || null,
      maxCount: maxCount || null,
    },
    statistics: {
      totalPlayers: rankingWithUser.length,
      totalXP: totalXp,
      averageXP: Math.round(averageXp * 10) / 10,
      topPlayerXP: rankingWithUser[0]?.totalXp || 0,
    },
    type: 'XP合計ランキング',
  };

  return createMCPJSONResult(response);
}
