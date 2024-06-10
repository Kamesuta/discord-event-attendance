import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventManager from '../../event/EventManager.js';
import { endEvent } from '../../event_handler.js';
import eventAdminCommand from './EventAdminCommand.js';

class EventAdminStopCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('stop')
    .setDescription('手動でイベントを終了します');

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベントを終了
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
    await endEvent(scheduledEvent);
    await interaction.editReply({
      content: `イベント「${scheduledEvent.name}」(ID: ${event.id})を終了しました`,
    });
  }
}

export default new EventAdminStopCommand(eventAdminCommand);
