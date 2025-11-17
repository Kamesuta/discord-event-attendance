import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import { onCreateScheduledEvent } from '../../handlers/event_handler.js';
import { eventCreatorCommand } from './EventCreatorCommand.js';

class EventCreatorImportCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('import')
    .setDescription('手動でDiscordイベントをインポートして作成します')
    .addStringOption((option) =>
      option
        .setName('discord_event_id')
        .setDescription('DiscordイベントID')
        .setRequired(true),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベントを開始
    await interaction.deferReply({ ephemeral: true });

    // DiscordイベントIDからイベントを取得
    const discordEventId = interaction.options.getString('discord_event_id');
    if (!discordEventId) {
      await interaction.editReply({
        content: 'DiscordイベントIDを指定してください',
      });
      return;
    }

    const scheduledEvent = await interaction.guild?.scheduledEvents
      .fetch(discordEventId)
      .catch(() => undefined);
    if (!scheduledEvent) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // イベントを作成
    const createdEvent = await onCreateScheduledEvent(scheduledEvent);
    if (!createdEvent) {
      await interaction.editReply({
        content: 'イベントの作成に失敗しました',
      });
      return;
    }

    await interaction.editReply({
      content: `イベント「${createdEvent.name}」(ID: ${createdEvent.id})をインポートして作成しました`,
    });
  }
}

/**
 * EventCreatorImportCommandのインスタンス
 */
export const eventCreatorImportCommand = new EventCreatorImportCommand(
  eventCreatorCommand,
);
