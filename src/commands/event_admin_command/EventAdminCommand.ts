import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { CommandGroupInteraction } from '../base/command_base.js';

class EventAdminCommand extends CommandGroupInteraction {
  command = new SlashCommandBuilder()
    .setDescription('出欠確認コマンド (管理者用)')
    .setName('event_admin')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);
}

export default new EventAdminCommand();
