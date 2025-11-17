import { Prisma } from '@prisma/client';

/**
 * イベントの取得条件（ホストと準備者を含む）
 */
export const eventIncludeHost = {
  include: {
    host: true,
    preparer: true,
  },
} as const satisfies Pick<Prisma.EventFindUniqueArgs, 'include'>;

/**
 * イベントにホストと準備者を含む型
 */
export type EventWithHost = Prisma.EventGetPayload<typeof eventIncludeHost>;
