import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventAdminCommand from './EventAdminCommand.js';
import getWebhook from '../../event/getWebhook.js';
import UpdateEventMessageMenu from '../contextmenu/UpdateEventMessageMenu.js';

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

    try {
      // イベントメッセージを更新
      const event = await UpdateEventMessageMenu.updateMessage(
        interaction,
        message,
      );

      // 結果を返信
      await interaction.editReply({
        content: `イベント「${event.name}」(ID: ${event.id})の情報を更新しました`,
      });
    } catch (error) {
      if (typeof error !== 'string') throw error;

      await interaction.editReply({
        content: error,
      });
      return;
    }
  }
}

export default new EventAdminUpdateMessageCommand(eventAdminCommand);
