import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventCommand from './EventCommand.js';
import { getEventFromId } from '../../event/event.js';
import { updateEvent } from '../../event_handler.js';

class EventUpdateCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('update')
    .setDescription('手動でイベント情報を更新します')
    .addIntegerOption((option) =>
      option
        .setName('event_id')
        .setDescription('イベントID (省略時は最新のイベントを表示)')
        .setRequired(false),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベント情報を更新
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
    await updateEvent(scheduledEvent);
    await interaction.editReply({
      content: `イベント「${scheduledEvent.name}」(ID: ${event.id})の情報を更新しました`,
    });
  }
}

export default new EventUpdateCommand(eventCommand);
