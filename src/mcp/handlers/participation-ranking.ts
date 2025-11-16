import { z } from 'zod';
import { createMCPJSONResult, MCPToolResult } from '../types.js';
import { parsePeriod } from '../../utils/parsers/periodParser.js';
import { prisma } from '../../utils/prisma.js';

/**
 * get-participation-rankingツールの定義
 */
export const getParticipationRankingTool = {
  name: 'get-participation-ranking',
  description: 'イベント参加回数ランキングを取得',
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
import { parseSearch } from '../../utils/parsers/searchParser.js';
import { GuildScheduledEventStatus } from 'discord.js';

/**
 * get-participation-rankingのスキーマ
 */
const getParticipationRankingSchema = z.object({
  period: z.string().optional(),
  search: z.string().optional(),
  maxCount: z.number().optional(),
  page: z.number().min(1).optional(),
});

/**
 * イベント参加回数ランキングを取得
 * @param args 引数
 * @returns MCPツールの結果
 */
export async function getParticipationRanking(
  args: unknown,
): Promise<MCPToolResult> {
  const {
    period: periodOption,
    search,
    maxCount = 20,
    page = 1,
  } = getParticipationRankingSchema.parse(args);

  // 期間指定を解析
  const period = parsePeriod(periodOption);

  // 検索条件を解析
  const nameCondition = parseSearch(search);

  // 参加回数ランキングを取得
  const ranking = await getJoinRanking(period.period, nameCondition);

  // ページング処理
  const itemsPerPage = maxCount || ranking.length; // maxCount が 0 の場合は全件表示
  const totalPages = Math.ceil(ranking.length / itemsPerPage);
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pagedRanking = ranking.slice(startIndex, endIndex);

  // 統計情報を取得

  // 全イベント数を取得
  const allEventCount = await prisma.event.count({
    where: {
      startTime: period.period,
      active: GuildScheduledEventStatus.Completed,
      ...nameCondition,
    },
  });

  // 全イベントのべ参加者数を取得
  const allUserCount = await prisma.userStat.count({
    where: {
      event: {
        startTime: period.period,
        active: GuildScheduledEventStatus.Completed,
        ...nameCondition,
      },
      show: true,
    },
  });

  // レスポンスデータを構築
  const response = {
    ranking: pagedRanking.map((item, index) => ({
      rank: startIndex + index + 1,
      user: {
        userId: item.userId,
        username: item.username,
        displayName: item.displayName,
        memberName: item.memberName,
      },
      participationCount: item.count,
      percentage:
        allEventCount > 0 ? Math.round((item.count / allEventCount) * 100) : 0,
    })),
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: ranking.length,
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
      totalParticipants: ranking.length,
      totalEvents: allEventCount,
      totalParticipations: allUserCount,
      averageParticipationPerUser:
        ranking.length > 0 ? Math.round(allUserCount / ranking.length) : 0,
    },
    type: '参加回数ランキング',
  };

  return createMCPJSONResult(response);
}

/**
 * 参加回数ランキングを取得
 * @param period 期間条件
 * @param nameCondition イベント名条件
 * @returns ランキング
 */
async function getJoinRanking(
  period: { gte: Date; lt: Date } | undefined,
  nameCondition: Record<string, unknown>,
): Promise<
  Array<{
    userId: string;
    username: string | null;
    displayName: string | null;
    memberName: string | null;
    count: number;
  }>
> {
  // ランキングを集計
  const ranking = await prisma.userStat.groupBy({
    by: ['userId'],
    where: {
      show: true,
      event: {
        startTime: period,
        active: GuildScheduledEventStatus.Completed,
        ...nameCondition,
      },
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _count: true,
  });

  // ユーザーIDを取得
  const userIds = ranking.map((event) => event.userId);
  const users = await prisma.user.findMany({
    where: {
      id: { in: userIds },
    },
  });

  // ランキング+Userを結合
  const rankingWithUser = ranking.map((stat) => {
    const user = users.find((user) => user.id === stat.userId);
    return {
      userId: user?.userId || '',
      username: user?.username || null,
      displayName: user?.displayName || null,
      memberName: user?.memberName || null,
      count: stat._count,
    };
  });

  // ランキングをソート
  return rankingWithUser.sort((a, b) => b.count - a.count);
}
