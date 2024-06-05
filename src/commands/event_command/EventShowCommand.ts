import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventCommand from './EventCommand.js';
import { getEventFromId } from '../../event/event.js';
import showEvent from '../../event/showEvent.js';

class EventShowCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('show')
    .setDescription('イベントの出欠状況を表示します')
    .addIntegerOption((option) =>
      option
        .setName('event_id')
        .setDescription('イベントID (省略時は最新のイベントを表示)')
        .setRequired(false),
    )
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
    const eventId = interaction.options.getInteger('event_id');
    const event = await getEventFromId(eventId ?? undefined);
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
    await showEvent(
      interaction,
      event,
      !!message,
      message ?? undefined,
      eventLinkMessage ?? undefined,
    );
  }
}

export default new EventShowCommand(eventCommand);
