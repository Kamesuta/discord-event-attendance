import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '@/commands/base/commandBase';
import { statusCommand } from './StatusCommand';
import { eventManager } from '@/domain/services/EventManager';
import { eventInfoMessageUpdater } from '@/messageUpdaters/EventInfoMessageUpdater';

class StatusEventCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('event')
    .setDescription('イベントの出欠状況を確認')
    .addIntegerOption((option) =>
      option
        .setName('event_id')
        .setDescription('イベントID (省略時は最新のイベントを表示)')
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName('show')
        .setDescription(
          'コマンドの結果をチャットに表示しますか？ (デフォルトは非公開)',
        )
        .setRequired(false),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベントの出欠状況を表示
    const show = interaction.options.getBoolean('show') ?? false;
    await interaction.deferReply({ ephemeral: !show });
    const eventId = interaction.options.getInteger('event_id');
    const event = await eventManager.getEventFromId(eventId ?? undefined);
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }
    await eventInfoMessageUpdater.showEvent(interaction, event);
  }
}

/**
 * StatusEventCommandのインスタンス
 */
export const statusEventCommand = new StatusEventCommand(statusCommand);
