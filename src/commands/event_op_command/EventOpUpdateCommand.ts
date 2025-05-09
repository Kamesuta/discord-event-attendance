import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventManager from '../../event/EventManager.js';
import { onUpdateScheduledEvent } from '../../event_handler.js';
import eventOpCommand from './EventOpCommand.js';

class EventOpUpdateCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('update')
    .setDescription('手動でイベント情報を更新します');

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベント情報を更新
    await interaction.deferReply({ ephemeral: true });
    const event = await eventManager.getEvent(interaction);
    const scheduledEvent = await eventManager.getScheduleEvent(
      interaction,
      event,
    );
    if (!event || !scheduledEvent) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }
    await onUpdateScheduledEvent(scheduledEvent);
    await interaction.editReply({
      content: `イベント「${scheduledEvent.name}」(ID: ${event.id})の情報を更新しました`,
    });
  }
}

export default new EventOpUpdateCommand(eventOpCommand);
