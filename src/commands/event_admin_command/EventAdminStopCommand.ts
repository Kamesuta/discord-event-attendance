import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import { eventManager } from '../../domain/services/EventManager.js';
import { onEndScheduledEvent } from '../../event_handler.js';
import { eventAdminCommand } from './EventAdminCommand.js';

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
    await onEndScheduledEvent(scheduledEvent);
    await interaction.editReply({
      content: `イベント「${scheduledEvent.name}」(ID: ${event.id})を終了しました`,
    });
  }
}

/**
 * EventAdminStopCommandのインスタンス
 */
export const eventAdminStopCommand = new EventAdminStopCommand(
  eventAdminCommand,
);
