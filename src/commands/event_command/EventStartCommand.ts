import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventCommand from './EventCommand.js';
import { startEvent } from '../../event_handler.js';

class EventStartCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('start')
    .setDescription('手動でイベントを開始します')
    .addIntegerOption((option) =>
      option
        .setName('event_id')
        .setDescription('DiscordのイベントID')
        .setRequired(true),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベントを開始
    await interaction.deferReply({ ephemeral: true });
    const eventId = interaction.options.getString('discord_event_id');
    const scheduledEvent = !eventId
      ? undefined
      : await interaction.guild?.scheduledEvents.fetch(eventId);
    if (!scheduledEvent) {
      await interaction.editReply({
        content: 'Discordイベントが見つかりませんでした',
      });
      return;
    }
    const event = await startEvent(scheduledEvent);
    if (!event) {
      await interaction.editReply({
        content: 'イベントの開始に失敗しました',
      });
      return;
    }
    await interaction.editReply({
      content: `イベント「${scheduledEvent.name}」(ID: ${event.id})を開始しました`,
    });
  }
}

export default new EventStartCommand(eventCommand);
