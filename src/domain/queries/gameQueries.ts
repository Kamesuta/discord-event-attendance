import { Prisma } from '@prisma/client';

/**
 * 試合の結果のinclude条件
 */
export const gameResultInclude = {
  include: {
    event: true,
    users: {
      include: {
        user: true,
      },
      orderBy: {
        rank: 'asc',
      } as never, // 型情報にはorderByは必要ないのでneverを指定
    },
  },
} as const satisfies Pick<Prisma.GameResultFindUniqueArgs, 'include'>;

/**
 * 試合の結果の型
 */
export type GameResultData = Prisma.GameResultGetPayload<
  typeof gameResultInclude
>;
