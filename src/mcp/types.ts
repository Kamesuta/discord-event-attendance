/**
 * MCP関連の共通型定義
 */

/**
 * MCPツールの戻り値の型
 */
export interface MCPToolResult {
  /** コンテンツ配列 */
  content: Array<{
    /** コンテンツタイプ */
    type: 'text';
    /** テキスト内容 */
    text: string;
  }>;
}

/**
 * 期間フィルター
 */
export interface PeriodFilter {
  /** 開始日 */
  start?: string;
  /** 終了日 */
  end?: string;
  /** 範囲指定 */
  range?: string;
}

/**
 * 検索・フィルター
 */
export interface SearchFilter {
  /** イベント名 */
  eventName?: string;
  /** 主催者ユーザーID */
  hostUserId?: string;
  /** 最小参加者数 */
  minParticipants?: number;
  /** 最大参加者数 */
  maxParticipants?: number;
}

/**
 * ページング
 */
export interface PaginationOptions {
  /** ページ番号 */
  page?: number;
  /** 表示件数 */
  limit?: number;
}

/**
 * ランキングデータ
 */
export interface RankingData {
  /** ユーザーID */
  userId: string;
  /** ランク */
  rank: number;
  /** 値 */
  value: number;
  /** ユーザー情報 */
  userInfo: {
    /** ユーザー名 */
    username: string;
    /** 表示名 */
    displayName: string;
    /** アバターURL */
    avatarURL?: string;
  };
}

/**
 * 時系列データ
 */
export interface TimeSeriesData {
  /** 期間 */
  period: string;
  /** 値 */
  value: number;
  /** メタデータ */
  metadata?: {
    /** イベント数 */
    eventCount: number;
    /** ユニークユーザー数 */
    uniqueUsers: number;
  };
}

/**
 * イベント分析データ
 */
export interface EventAnalytics {
  /** イベントID */
  eventId: number;
  /** イベント名 */
  eventName: string;
  /** 参加者数 */
  participantCount: number;
  /** ゲーム数 */
  gameCount: number;
  /** 平均XP */
  averageXP: number;
  /** 新規参加者数 */
  newParticipants: number;
  /** リピート率 */
  returnRate: number;
}

/**
 * MCPツールの結果を作成するヘルパー関数
 * @param text 結果テキスト
 * @returns MCPツールの結果
 */
export function createMCPResult(text: string): MCPToolResult {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
  };
}

/**
 * MCPツールの結果をJSONで作成するヘルパー関数
 * @param data 結果データ
 * @returns MCPツールの結果
 */
export function createMCPJSONResult(data: unknown): MCPToolResult {
  return createMCPResult(JSON.stringify(data, null, 2));
}
