import { z } from 'zod';
import { createMCPJSONResult, MCPToolResult } from '../types.js';
import { parsePeriod } from '../../utils/parsers/periodParser.js';
import { parseSearch } from '../../utils/parsers/searchParser.js';
import { GuildScheduledEventStatus } from 'discord.js';
import { prisma } from '../../utils/prisma.js';

/**
 * get-event-listツールの定義
 */
export const getEventListTool = {
  name: 'get-event-list',
  description: 'イベント一覧を期間・検索条件で取得',
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
      sort: {
        type: 'string' as const,
        enum: ['join', 'startTime', 'id'],
        description: 'ソート順（join=参加者数、startTime=開始日時、id=ID順）',
      },
      page: {
        type: 'number' as const,
        minimum: 1,
        description: 'ページ番号',
      },
    },
  },
};

/**
 * get-event-listのスキーマ
 */
const getEventListSchema = z.object({
  period: z.string().optional(),
  search: z.string().optional(),
  sort: z.enum(['join', 'startTime', 'id']).optional(),
  page: z.number().min(1).optional(),
});

/**
 * イベント詳細型
 */
interface EventDetail {
  /** イベントID */
  id: number;
  /** DiscordイベントID */
  eventId: string;
  /** イベント名 */
  name: string;
  /** 説明 */
  description: string | null;
  /** 開始時間 */
  startTime: Date | null;
  /** 終了時間 */
  endTime: Date | null;
  /** 参加者数 */
  participantCount: number;
  /** 主催者 */
  host: {
    /** ユーザーID */
    userId: string;
    /** 表示名 */
    displayName: string | null;
  } | null;
}

/**
 * イベント一覧を期間・検索条件で取得
 * @param args 引数
 * @returns MCPツールの結果
 */
export async function getEventList(args: unknown): Promise<MCPToolResult> {
  const {
    period: periodOption,
    search,
    sort = 'join',
    page = 1,
  } = getEventListSchema.parse(args);

  // 期間指定を解析
  const period = parsePeriod(periodOption);

  // 検索条件を解析
  const nameCondition = parseSearch(search);

  // イベントを取得
  const events = await getEvents(
    {
      active: GuildScheduledEventStatus.Completed,
      startTime: period.period,
      ...nameCondition,
    },
    sort,
  );

  // ページング処理
  const itemsPerPage = 20;
  const totalPages = Math.ceil(events.length / itemsPerPage);
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pagedEvents = events.slice(startIndex, endIndex);

  // 全イベント数と参加者数の統計を取得
  const allEventCount = await prisma.event.count({
    where: {
      startTime: period.period,
      active: GuildScheduledEventStatus.Completed,
      ...nameCondition,
    },
  });

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

  // ソート順のテキスト
  let sortText = '不明順';
  switch (sort) {
    case 'join':
      sortText = '人気イベント順';
      break;
    case 'startTime':
      sortText = '開始時間順';
      break;
    case 'id':
      sortText = 'ID順';
      break;
  }

  // レスポンスデータを構築
  const response = {
    events: pagedEvents.map((event) => ({
      id: event.id,
      eventId: event.eventId,
      name: event.name,
      description: event.description,
      startTime: event.startTime?.toISOString(),
      endTime: event.endTime?.toISOString(),
      participantCount: event.participantCount,
      host: event.host
        ? {
            userId: event.host.userId,
            displayName: event.host.displayName,
          }
        : null,
    })),
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: events.length,
      itemsPerPage,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    },
    filter: {
      period: period.text,
      search: search || null,
      sort: sortText,
    },
    statistics: {
      filteredEventCount: events.length,
      totalEventCount: allEventCount,
      totalParticipantCount: allUserCount,
    },
  };

  return createMCPJSONResult(response);
}

/**
 * イベントを取得する
 * @param whereCondition 検索条件
 * @param sort ソート順
 * @returns イベント一覧
 */
async function getEvents(
  whereCondition: Record<string, unknown>,
  sort: string,
): Promise<EventDetail[]> {
  // ソート条件を設定
  let orderBy: Record<string, string> = {};
  switch (sort) {
    case 'join':
      // 参加者数順はSQLでソートする必要があるため後で処理
      orderBy = { startTime: 'desc' };
      break;
    case 'startTime':
      orderBy = { startTime: 'desc' };
      break;
    case 'id':
      orderBy = { id: 'desc' };
      break;
  }

  // イベントと参加者数を取得
  const events = await prisma.event.findMany({
    where: whereCondition,
    include: {
      host: {
        select: {
          userId: true,
          displayName: true,
        },
      },
      stats: {
        where: {
          show: true,
        },
        select: {
          userId: true,
        },
      },
    },
    orderBy,
  });

  // EventDetail形式に変換
  const eventDetails: EventDetail[] = events.map((event) => ({
    id: event.id,
    eventId: event.eventId,
    name: event.name,
    description: event.description,
    startTime: event.startTime,
    endTime: event.endTime,
    participantCount: event.stats.length,
    host: event.host
      ? {
          userId: event.host.userId,
          displayName: event.host.displayName,
        }
      : null,
  }));

  // 参加者数順でソートする場合
  if (sort === 'join') {
    eventDetails.sort((a, b) => b.participantCount - a.participantCount);
  }

  return eventDetails;
}
