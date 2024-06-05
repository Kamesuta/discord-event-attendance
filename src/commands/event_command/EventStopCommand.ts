import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventCommand from './EventCommand.js';
import { getEventFromId } from '../../event/event.js';
import { endEvent } from '../../event_handler.js';

class EventStopCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('stop')
    .setDescription('手動でイベントを終了します')
    .addIntegerOption((option) =>
      option
        .setName('event_id')
        .setDescription('イベントID (省略時は最新のイベントを表示)')
        .setRequired(false),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベントを終了
    await interaction.deferReply({ ephemeral: true });
    const eventId = interaction.options.getInteger('event_id');
    const event = await getEventFromId(eventId ?? undefined);
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }
    const scheduledEvent = !event
      ? undefined
      : await interaction.guild?.scheduledEvents.fetch(event.eventId);
    if (!scheduledEvent) {
      await interaction.editReply({
        content: 'Discordイベントが見つかりませんでした',
      });
      return;
    }
    await endEvent(scheduledEvent);
    await interaction.editReply({
      content: `イベント「${scheduledEvent.name}」(ID: ${event.id})を終了しました`,
    });
  }
}

export default new EventStopCommand(eventCommand);
