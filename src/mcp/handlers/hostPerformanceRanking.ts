import { z } from 'zod';
import { createMCPJSONResult, MCPToolResult } from '@/mcp/types';
import { parsePeriod } from '@/domain/parsers/periodParser';
import { prisma } from '@/utils/prisma';

/**
 * get-host-performance-rankingツールの定義
 */
export const getHostPerformanceRankingTool = {
  name: 'get-host-performance-ranking',
  description: '主催者評価ランキングを取得',
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
import { parseSearch } from '@/domain/parsers/searchParser';
import { GuildScheduledEventStatus } from 'discord.js';

const getHostPerformanceRankingSchema = z.object({
  period: z.string().optional(),
  search: z.string().optional(),
  maxCount: z.number().optional(),
  page: z.number().min(1).optional(),
});

/**
 * 主催者ごとのイベント参加人数ランキング（主催者評価）を取得
 * @param args 引数
 * @returns MCPツールの結果
 */
export async function getHostPerformanceRanking(
  args: unknown,
): Promise<MCPToolResult> {
  const {
    period: periodOption,
    search,
    maxCount = 20,
    page = 1,
  } = getHostPerformanceRankingSchema.parse(args);

  const period = parsePeriod(periodOption);
  const nameCondition = parseSearch(search);

  // 主催者ごとのイベントと参加者数を取得
  const events = await prisma.event.findMany({
    where: {
      active: GuildScheduledEventStatus.Completed,
      startTime: period.period,
      ...nameCondition,
    },
    include: {
      host: {
        select: {
          userId: true,
          username: true,
          displayName: true,
          memberName: true,
        },
      },
      stats: {
        where: {
          show: true,
        },
      },
    },
  });

  // 主催者ごとにグループ化
  const hostGroups = events.reduce(
    (acc, event) => {
      if (!event.hostId || !event.host) return acc;

      const hostId = event.host.userId;
      if (!acc[hostId]) {
        acc[hostId] = {
          host: event.host,
          events: [],
        };
      }
      acc[hostId].events.push({
        id: event.id,
        name: event.name,
        participantCount: event.stats.length,
        startTime: event.startTime,
      });
      return acc;
    },
    {} as Record<
      string,
      {
        host: {
          userId: string;
          username: string | null;
          displayName: string | null;
          memberName: string | null;
        };
        events: Array<{
          id: number;
          name: string;
          participantCount: number;
          startTime: Date | null;
        }>;
      }
    >,
  );

  // 最大参加人数を取得
  const maxJoinCount = events.reduce((max, event) => {
    return Math.max(max, event.stats.length);
  }, 0);

  // 最低主催回数
  const minHostCount = 3;

  // 主催者ごとの統計を計算
  const hostStats = Object.values(hostGroups).map(({ host, events }) => {
    const joinCountArray = events.map((event) => event.participantCount);
    const average =
      joinCountArray.reduce((sum, count) => sum + count, 0) /
      joinCountArray.length;
    const median = calculateMedian(joinCountArray);

    // 分布図データを生成（16個のバーで表現）
    const barLength = 16;
    const distributionBars = Array.from({ length: barLength }, (_, i) => {
      return joinCountArray.filter(
        (count) => Math.floor((count / maxJoinCount) * barLength) === i,
      ).length;
    });

    // 評価値計算（最低主催回数を満たしているかで重み付け）
    const valuation =
      (events.length >= minHostCount ? maxJoinCount : 0) + average;

    return {
      host,
      eventCount: events.length,
      average: Math.round(average * 100) / 100,
      median,
      maxParticipants: Math.max(...joinCountArray),
      minParticipants: Math.min(...joinCountArray),
      totalParticipants: joinCountArray.reduce((sum, count) => sum + count, 0),
      distributionBars,
      valuation,
      events: events.sort(
        (a, b) => (b.startTime?.getTime() || 0) - (a.startTime?.getTime() || 0),
      ),
    };
  });

  // 評価値でソート
  const ranking = hostStats.sort((a, b) => b.valuation - a.valuation);

  // ページング処理
  const itemsPerPage = maxCount || ranking.length;
  const totalPages = Math.ceil(ranking.length / itemsPerPage);
  const startIndex = (page - 1) * itemsPerPage;
  const pagedRanking = ranking.slice(startIndex, startIndex + itemsPerPage);

  const response = {
    ranking: pagedRanking.map((item, index) => ({
      rank: startIndex + index + 1,
      host: {
        userId: item.host.userId,
        username: item.host.username,
        displayName: item.host.displayName,
        memberName: item.host.memberName,
      },
      statistics: {
        eventCount: item.eventCount,
        averageParticipants: item.average,
        medianParticipants: item.median,
        maxParticipants: item.maxParticipants,
        minParticipants: item.minParticipants,
        totalParticipants: item.totalParticipants,
        meetsMinimumRequirement: item.eventCount >= minHostCount,
      },
      distributionChart: {
        bars: item.distributionBars,
        maxValue: Math.max(...item.distributionBars),
        description:
          '参加人数の分布（横軸: 参加人数の範囲、縦軸: 該当イベント数）',
      },
      recentEvents: item.events.slice(0, 5).map((event) => ({
        id: event.id,
        name: event.name,
        participantCount: event.participantCount,
        startTime: event.startTime?.toISOString(),
      })),
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
      totalHosts: ranking.length,
      qualifiedHosts: ranking.filter((h) => h.eventCount >= minHostCount)
        .length,
      averageEventsPerHost:
        ranking.length > 0
          ? Math.round(
              ranking.reduce((sum, h) => sum + h.eventCount, 0) /
                ranking.length,
            )
          : 0,
      overallAverageParticipants:
        ranking.length > 0
          ? Math.round(
              (ranking.reduce((sum, h) => sum + h.average, 0) /
                ranking.length) *
                100,
            ) / 100
          : 0,
      minimumEventRequirement: minHostCount,
    },
    type: '主催者評価ランキング',
  };

  return createMCPJSONResult(response);
}

/**
 * 中央値を計算する
 * @param arr 数値配列
 * @returns 中央値
 */
function calculateMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}
