import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventManager from '../../event/EventManager.js';
import eventInfoMessageUpdater from '../../message_updaters/EventInfoMessageUpdater.js';
import eventOpCommand from './EventOpCommand.js';

class EventOpShowCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('show')
    .setDescription('イベントの出欠状況を表示します')
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('送信するメッセージ')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('invite_link_message')
        .setDescription('イベントリンクに表示するメッセージ')
        .setRequired(false),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    const event = await eventManager.getEvent(interaction);
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }
    const message = interaction.options.getString('message');
    const eventLinkMessage = interaction.options.getString(
      'invite_link_message',
    );
    const isWebhook = !!message;
    await eventInfoMessageUpdater.showEvent(
      interaction,
      event,
      interaction.channel ?? undefined,
      message ?? undefined,
      eventLinkMessage ?? undefined,
    );

    if (isWebhook) {
      await interaction.deleteReply();
    }
  }
}

export default new EventOpShowCommand(eventOpCommand);
