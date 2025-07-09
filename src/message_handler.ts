import { GuildScheduledEventStatus, Message } from 'discord.js';
import { config } from './utils/config.js';
import { prisma } from './utils/prisma.js';
import { logger } from './utils/log.js';
import { dmRelayManager } from './event/DMRelayManager.js';

/**
 * メッセージが送信されたときのイベントハンドラー
 * @param message メッセージ
 */
export async function onMessageCreate(message: Message): Promise<void> {
  try {
    // DMメッセージの処理
    if (message.channel.isDMBased()) {
      await handleDMMessage(message);
      return;
    }

    // 指定のサーバー以外無視
    if (message.guild?.id !== config.guild_id) {
      return;
    }

    // DM転送スレッドでのメッセージ処理
    if (dmRelayManager.isDMRelayTarget(message)) {
      await handleDMRelayMessage(message);
      return;
    }

    // 既存のイベント処理
    await handleEventMessage(message);
  } catch (error) {
    logger.error('onMessageCreate中にエラーが発生しました。', error);
  }
}

/**
 * DMメッセージの処理
 * @param message DMメッセージ
 */
async function handleDMMessage(message: Message): Promise<void> {
  try {
    // ボットのメッセージは無視
    if (message.author.bot) {
      return;
    }

    // お伺い関連のDMかチェック
    const hostRequest = await dmRelayManager.getHostRequestFromDM(message);
    if (!hostRequest) {
      // お伺い関連でないDMは無視
      return;
    }

    // 管理チャンネルに転送
    await dmRelayManager.relayDMToChannel(
      message,
      hostRequest.id,
      hostRequest.event.name,
      hostRequest.user.username || 'Unknown User',
    );

    logger.info(
      `お伺い関連DMを転送しました: User=${message.author.username}, Event=${hostRequest.event.name}`,
    );
  } catch (error) {
    logger.error('DM処理でエラー:', error);
  }
}

/**
 * DM転送スレッドでのメッセージ処理
 * @param message チャンネルメッセージ
 */
async function handleDMRelayMessage(message: Message): Promise<void> {
  try {
    // ボットのメッセージは無視
    if (message.author.bot) {
      return;
    }

    // スレッドからユーザーIDを取得
    if (!message.channel.isThread()) {
      return;
    }

    // スレッド名からユーザー名を抽出
    const threadNameMatch = message.channel.name.match(/\[DM転送\] .+ - (.+)$/);
    if (!threadNameMatch) {
      logger.warn(`DM転送スレッドの名前が不正です: ${message.channel.name}`);
      return;
    }

    const userName = threadNameMatch[1];

    // ギルドメンバーからユーザーIDを検索
    const guild = message.guild;
    if (!guild) {
      logger.error('ギルドが見つかりません');
      return;
    }

    const members = await guild.members.fetch();
    const member = members.find(
      (m) => m.displayName === userName || m.user.username === userName,
    );

    if (!member) {
      logger.warn(`ユーザーが見つかりません: ${userName}`);
      return;
    }

    // DMに転送
    await dmRelayManager.relayChannelToDM(message, member.user.id);

    logger.info(
      `管理チャンネルメッセージをDMに転送しました: Admin=${message.author.username}, User=${userName}`,
    );
  } catch (error) {
    logger.error('DM転送スレッド処理でエラー:', error);
  }
}

/**
 * イベントメッセージの処理（既存の処理）
 * @param message メッセージ
 */
async function handleEventMessage(message: Message): Promise<void> {
  try {
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
    logger.error('イベントメッセージ処理でエラー:', error);
  }
}
