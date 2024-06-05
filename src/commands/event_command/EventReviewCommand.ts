import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventCommand from './EventCommand.js';
import { getEventFromId } from '../../event/event.js';
import reviewEvent from '../../event/reviewEvent.js';

class EventReviewCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('review')
    .setDescription('イベントの出欠状況を表示します (自分のみに表示)')
    .addIntegerOption((option) =>
      option
        .setName('event_id')
        .setDescription('イベントID (省略時は最新のイベントを表示)')
        .setRequired(false),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // 公開前のメンバー確認
    await interaction.deferReply({ ephemeral: true });
    const eventId = interaction.options.getInteger('event_id');
    const event = await getEventFromId(eventId ?? undefined);
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }
    await reviewEvent(interaction, event);
  }
}

export default new EventReviewCommand(eventCommand);
