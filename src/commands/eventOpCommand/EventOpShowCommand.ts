import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '@/commands/base/commandBase';
import { eventManager } from '@/domain/services/EventManager';
import { eventInfoMessageUpdater } from '@/messageUpdaters/EventInfoMessageUpdater';
import { eventOpCommand } from './EventOpCommand';

class EventOpShowCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('show')
    .setDescription('イベントの出欠状況を表示します')
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('送信するメッセージ')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('invite_link_message')
        .setDescription('イベントリンクに表示するメッセージ')
        .setRequired(false),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const event = await eventManager.getEvent(interaction);
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }
    const message = interaction.options.getString('message');
    const eventLinkMessage = interaction.options.getString(
      'invite_link_message',
    );
    const isWebhook = !!message;
    await eventInfoMessageUpdater.showEvent(
      interaction,
      event,
      interaction.channel ?? undefined,
      message ?? undefined,
      eventLinkMessage ?? undefined,
    );

    if (isWebhook) {
      await interaction.deleteReply();
    }
  }
}

/**
 * EventOpShowCommandのインスタンス
 */
export const eventOpShowCommand = new EventOpShowCommand(eventOpCommand);
