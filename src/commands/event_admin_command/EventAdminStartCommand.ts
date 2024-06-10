import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import { startEvent } from '../../event_handler.js';
import eventAdminCommand from './EventAdminCommand.js';
import eventManager from '../../event/EventManager.js';

class EventAdminStartCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('start')
    .setDescription('手動でイベントを開始します');

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベントを開始
    await interaction.deferReply({ ephemeral: true });
    const scheduledEvent = await eventManager.getScheduleEvent(
      interaction,
      await eventManager.getEvent(interaction),
    );
    if (!scheduledEvent) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }
    const startedEvent = await startEvent(scheduledEvent);
    if (!startedEvent) {
      await interaction.editReply({
        content: 'イベントの開始に失敗しました',
      });
      return;
    }
    await interaction.editReply({
      content: `イベント「${startedEvent.name}」(ID: ${startedEvent.id})を開始しました`,
    });
  }
}

export default new EventAdminStartCommand(eventAdminCommand);
