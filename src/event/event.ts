import { prisma } from '../index.js';
import { Event } from '@prisma/client';

/**
 * DiscordのイベントIDからイベントを取得します
 * @param eventId DiscordのイベントID
 * @returns イベント
 */
export async function getEventFromDiscordId(
  eventId: string | undefined,
): Promise<Event | null> {
  return await prisma.event.findFirst({
    where: {
      eventId,
    },
    orderBy: {
      startTime: 'desc',
    },
    take: 1,
  });
}

/**
 * イベントIDからイベントを取得します
 * @param eventId イベントID
 * @returns イベント
 */
export async function getEventFromId(
  eventId: number | undefined,
): Promise<Event | null> {
  return await prisma.event.findFirst({
    where: {
      id: eventId,
    },
    orderBy: {
      startTime: 'desc',
    },
    take: 1,
  });
}
