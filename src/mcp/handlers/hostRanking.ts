import { z } from 'zod';
import { createMCPJSONResult, MCPToolResult } from '@/mcp/types';
import { parsePeriod } from '@/domain/parsers/periodParser';
import { prisma } from '@/utils/prisma';
import { parseSearch } from '@/domain/parsers/searchParser';
import { GuildScheduledEventStatus } from 'discord.js';

/**
 * get-host-rankingツールの定義
 */
export const getHostRankingTool = {
  name: 'get-host-ranking',
  description: 'イベント主催回数ランキングを取得',
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

const getHostRankingSchema = z.object({
  period: z.string().optional(),
  search: z.string().optional(),
  maxCount: z.number().optional(),
  page: z.number().min(1).optional(),
});

/**
 * イベント主催回数ランキングを取得
 * @param args 引数
 * @returns MCPツールの結果
 */
export async function getHostRanking(args: unknown): Promise<MCPToolResult> {
  const {
    period: periodOption,
    search,
    maxCount = 20,
    page = 1,
  } = getHostRankingSchema.parse(args);

  const period = parsePeriod(periodOption);
  const nameCondition = parseSearch(search);

  // 主催イベントを取得
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
    },
  });

  // ホストごとのイベント数を集計
  const hostCounts = events.reduce(
    (acc, event) => {
      if (!event.hostId || !event.host) return acc;
      const userId = event.host.userId;

      if (!acc[userId]) {
        acc[userId] = {
          userId,
          username: event.host.username,
          displayName: event.host.displayName,
          memberName: event.host.memberName,
          count: 0,
        };
      }
      acc[userId].count += 1;
      return acc;
    },
    {} as Record<
      string,
      {
        userId: string;
        username: string | null;
        displayName: string | null;
        memberName: string | null;
        count: number;
      }
    >,
  );

  const ranking = Object.values(hostCounts).sort((a, b) => b.count - a.count);

  // ページング処理
  const itemsPerPage = maxCount || ranking.length;
  const totalPages = Math.ceil(ranking.length / itemsPerPage);
  const startIndex = (page - 1) * itemsPerPage;
  const pagedRanking = ranking.slice(startIndex, startIndex + itemsPerPage);

  const response = {
    ranking: pagedRanking.map((item, index) => ({
      rank: startIndex + index + 1,
      user: {
        userId: item.userId,
        username: item.username,
        displayName: item.displayName,
        memberName: item.memberName,
      },
      hostCount: item.count,
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
      totalHostedEvents: events.filter((e) => e.hostId).length,
      averageEventsPerHost:
        ranking.length > 0
          ? Math.round(events.filter((e) => e.hostId).length / ranking.length)
          : 0,
    },
    type: '主催回数ランキング',
  };

  return createMCPJSONResult(response);
}
