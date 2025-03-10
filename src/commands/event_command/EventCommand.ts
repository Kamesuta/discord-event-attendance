import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { CommandGroupInteraction } from '../base/command_base.js';

class EventCommand extends CommandGroupInteraction {
  command = new SlashCommandBuilder()
    .setDescription('イベント主催者用コマンド')
    .setName('event')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);
}

export default new EventCommand();
