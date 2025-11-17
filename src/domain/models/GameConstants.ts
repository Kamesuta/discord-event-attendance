import { User } from '@prisma/client';

/**
 * イベントの結果
 */
export interface Award {
  /** ユーザー */
  user: User;
  /** ランク */
  rank: number;
  /** 経験値（XP） */
  xp?: number;
  /** 属するグループ */
  group?: string;
}

/** 連番アルファベット */
export const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** 順位&XP配分マップ */
export const xpMap = [100, 75, 50, 40, 30, 20, 10, 5, 4, 3, 2, 1];
