import {
  RepliableInteraction,
  Webhook,
  NonThreadGuildBasedChannel,
  ThreadChannel,
  TextBasedChannel,
} from 'discord.js';
import { client } from '../client.js';
import { logger } from '../log.js';

/**
 * Webhookを取得/作成します
 * @param channel 対象チャンネル
 * @returns Webhookのチャンネルとスレッド
 * @throws {Error} チャンネルが無効、Webhook取得/作成に失敗した場合
 */
export async function getWebhook(channel: TextBasedChannel): Promise<{
  webhook: Webhook;
  channel: NonThreadGuildBasedChannel;
  thread: ThreadChannel | undefined;
}> {
  if (!channel || channel.isDMBased()) {
    throw new Error('このチャンネルではWebhookを使用できません');
  }

  let targetChannel: NonThreadGuildBasedChannel;
  let thread: ThreadChannel | undefined;

  if (channel.isThread()) {
    if (!channel.parent) {
      throw new Error('親チャンネルが見つかりませんでした');
    }
    targetChannel = channel.parent;
    thread = channel;
  } else {
    targetChannel = channel;
  }

  // Webhookを取得
  const webhooks = await targetChannel.fetchWebhooks().catch((error) => {
    logger.error('Webhookの取得に失敗しました:', error);
    throw new Error('Webhookの取得に失敗しました。権限を確認してください');
  });

  // 自身のWebhookを取得
  let webhook = webhooks.find(
    (webhook) => webhook.owner?.id === client.user?.id,
  );

  // Webhookがない場合は作成
  if (!webhook) {
    webhook = await targetChannel
      .createWebhook({
        name: 'イベント通知用',
        avatar: client.user?.displayAvatarURL(),
      })
      .catch((error) => {
        logger.error('Webhookの作成に失敗しました:', error);
        throw new Error('Webhookの作成に失敗しました');
      });
  }

  return { webhook, channel: targetChannel, thread };
}

/**
 * Webhookを取得/作成します（interaction版 - 後方互換性のため）
 * @param interaction インタラクション
 * @param webhookChannel チャンネル (省略時はinteraction.channel)
 * @returns Webhookのチャンネルとスレッド
 */
export async function getWebhookFromInteraction(
  interaction: RepliableInteraction,
  webhookChannel?: TextBasedChannel,
): Promise<
  | {
      webhook: Webhook;
      channel: NonThreadGuildBasedChannel;
      thread: ThreadChannel | undefined;
    }
  | undefined
> {
  try {
    const channel = webhookChannel ?? interaction.channel;
    if (!channel) {
      await interaction.editReply({
        content: 'チャンネルが見つかりませんでした',
      });
      return;
    }

    return await getWebhook(channel);
  } catch (error) {
    await interaction.editReply({
      content: typeof error === 'string' ? error : String(error),
    });
    return;
  }
}
