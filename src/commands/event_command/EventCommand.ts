import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { CommandGroupInteraction } from '../base/command_base.js';

class EventCommand extends CommandGroupInteraction {
  command = new SlashCommandBuilder()
    .setDescription('出欠確認コマンド (イベント管理者用)')
    .setName('event')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);
}

export default new EventCommand();
