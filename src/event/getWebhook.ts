import {
  RepliableInteraction,
  Webhook,
  NonThreadGuildBasedChannel,
  ThreadChannel,
  TextBasedChannel,
} from 'discord.js';
import { client } from '../index.js';
import { logger } from '../utils/log.js';

/**
 * Webhookを取得/作成します
 * @param interaction インタラクション
 * @param webhookChannel チャンネル (省略時はinteraction.channel)
 * @returns Webhookのチャンネルとスレッド
 */
export default async function getWebhook(
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
  // Webhook送信系の処理
  const interactionChannel = webhookChannel ?? interaction.channel;
  if (!interactionChannel || interactionChannel.isDMBased()) {
    await interaction.editReply({
      content: 'このコマンドはサーバー内でのみ使用できます',
    });
    return;
  }

  let channel: NonThreadGuildBasedChannel;
  let thread: ThreadChannel | undefined;
  if (interactionChannel.isThread()) {
    if (!interactionChannel.parent) {
      await interaction.editReply({
        content: '親チャンネルが見つかりませんでした',
      });
      return;
    }
    channel = interactionChannel.parent;
    thread = interactionChannel;
  } else {
    channel = interactionChannel;
  }

  // Webhookを取得
  const webhooks = await channel.fetchWebhooks().catch((error) => {
    logger.error('Webhookの取得に失敗しました:', error);
    return;
  });
  if (!webhooks) {
    await interaction.editReply({
      content: 'Webhookの取得に失敗しました。権限を確認してください',
    });
    return;
  }
  // 自身のWebhookを取得
  let webhook = webhooks.find(
    (webhook) => webhook.owner?.id === client.user?.id,
  );
  // Webhookがない場合は作成
  if (!webhook) {
    webhook = await channel
      .createWebhook({
        name: 'イベント通知用',
        avatar: client.user?.displayAvatarURL(),
      })
      .catch((error) => {
        logger.error('Webhookの作成に失敗しました:', error);
        return undefined;
      });
    if (!webhook) {
      await interaction.editReply({
        content: 'Webhookの作成に失敗しました',
      });
      return;
    }
  }
  return { webhook, channel, thread };
}
