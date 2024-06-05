import { prisma } from '../index.js';
import { Event } from '@prisma/client';

/**
 * 出欠状況を更新する
 * @param event イベント
 * @param userIds ユーザーID
 * @param isShow 出欠状況
 */
export default async function setShowStats(
  event: Event,
  userIds: string[],
  isShow: boolean | null,
): Promise<void> {
  // ユーザーの出欠状況を更新
  const query = userIds.map((userId) =>
    prisma.userStat.upsert({
      where: {
        id: {
          eventId: event.id,
          userId,
        },
      },
      update: {
        show: isShow,
      },
      create: {
        eventId: event.id,
        userId,
        show: isShow,
        duration: 0,
      },
    }),
  );
  await prisma.$transaction(query);
}
