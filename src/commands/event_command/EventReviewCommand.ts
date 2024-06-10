import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventCommand from './EventCommand.js';
import eventManager from '../../event/EventManager.js';
import reviewEvent from '../../event/reviewEvent.js';

class EventReviewCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('review')
    .setDescription('イベントの出欠状況を表示します (自分のみに表示)');

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // 公開前のメンバー確認
    await interaction.deferReply({ ephemeral: true });
    const event = await eventManager.getEvent(interaction);
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
