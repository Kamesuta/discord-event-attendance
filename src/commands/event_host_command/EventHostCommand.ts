import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { CommandGroupInteraction } from '../base/command_base.js';

/**
 * 主催者お伺いワークフロー用のメインコマンドグループ
 * /event_host コマンドの基底クラス
 */
class EventHostCommand extends CommandGroupInteraction {
  command = new SlashCommandBuilder()
    .setDescription('主催者お伺いワークフロー管理')
    .setName('event_host')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);
}

export default new EventHostCommand();
