import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { CommandGroupInteraction } from '../base/command_base.js';

class EventOpCommand extends CommandGroupInteraction {
  command = new SlashCommandBuilder()
    .setDescription('イベント対応員用コマンド')
    .setName('event_op')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);
}

/**
 * EventOpCommandのインスタンス
 */
export const eventOpCommand = new EventOpCommand();
