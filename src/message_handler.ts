import { GuildScheduledEventStatus, Message } from 'discord.js';
import { config } from './utils/config.js';
import { prisma } from './utils/prisma.js';
import { logger } from './utils/log.js';

/**
 * メッセージが送信されたときのイベントハンドラー
 * @param message メッセージ
 */
export async function onMessageCreate(message: Message): Promise<void> {
  try {
    // 指定のサーバー以外無視
    if (message.guild?.id !== config.guild_id) {
      return;
    }

    // イベント開催中のボイスチャンネルにいるかどうかを確認する
    const event = await prisma.event.findFirst({
      where: {
        channelId: message.channelId,
        active: GuildScheduledEventStatus.Active,
        messageId: null,
      },
      take: 1,
    });
    if (!event) {
      return;
    }

    // メッセージ情報を更新
    await prisma.event.update({
      where: {
        id: event.id,
      },
      data: {
        messageId: message.id,
      },
    });
  } catch (error) {
    logger.error('onMessageCreate中にエラーが発生しました。', error);
  }
}
