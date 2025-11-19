import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '@/commands/base/commandBase';
import { onStartScheduledEvent } from '@/handlers/eventHandler';
import { eventAdminCommand } from './EventAdminCommand';
import { eventManager } from '@/domain/services/EventManager';

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
    const startedEvent = await onStartScheduledEvent(scheduledEvent);
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

/**
 * EventAdminStartCommandのインスタンス
 */
export const eventAdminStartCommand = new EventAdminStartCommand(
  eventAdminCommand,
);
