import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventManager from '../../event/EventManager.js';
import { onUpdateScheduledEvent } from '../../event_handler.js';
import eventAdminCommand from './EventAdminCommand.js';
import showEvent from '../../event/showEvent.js';
import getWebhook from '../../event/getWebhook.js';

class EventAdminUpdateMessageCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('update_message')
    .setDescription('イベント情報を更新')
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('イベントのメッセージ')
        .setRequired(true),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    // メッセージを取得
    const messageId = interaction.options.getString('message');
    if (!messageId) return;
    // Webhook経由でメッセージを取得
    const webhook = await getWebhook(interaction);
    const message = await webhook?.webhook.fetchMessage(messageId);
    if (!message) {
      await interaction.editReply({
        content: 'メッセージが見つかりませんでした',
      });
      return;
    }

    // EmbedのURLを解析
    const url = message.embeds[0]?.url;
    if (!url) {
      await interaction.editReply({
        content: 'イベントお知らせメッセージに対してのみ使用できます',
      });
      return;
    }
    const match = url.match(/\/(\d+)$/);
    if (!match) {
      await interaction.editReply({
        content: 'イベントお知らせメッセージのURLが不正です',
      });
      return;
    }
    const scheduledEventId = match[1];
    // ScheduledEventが取得できれば更新
    const scheduledEvent = await interaction.guild?.scheduledEvents
      .fetch(scheduledEventId)
      .catch(() => undefined);
    if (scheduledEvent) {
      await onUpdateScheduledEvent(scheduledEvent);
    }
    // イベント情報を取得
    const event = await eventManager.getEventFromDiscordId(scheduledEventId);
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // メッセージを抽出 (\n\n[～](https://discord.com/events/～) は削除)
    const messageMatch = message.content.match(
      /^(.+)(?:\n\n\[(.+)\]\(https:\/\/discord.com\/events\/.+\))?$/,
    );

    // イベント情報を編集
    await showEvent(
      interaction,
      event,
      interaction.channel ?? undefined,
      messageMatch?.[1],
      messageMatch?.[2],
      message,
    );

    await interaction.editReply({
      content: `イベント「${event.name}」(ID: ${event.id})の情報を更新しました`,
    });
  }
}

export default new EventAdminUpdateMessageCommand(eventAdminCommand);
