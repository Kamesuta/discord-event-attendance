import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { CommandGroupInteraction } from '../base/commandBase.js';

class EventCommand extends CommandGroupInteraction {
  command = new SlashCommandBuilder()
    .setDescription('イベント主催者用コマンド')
    .setName('event')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);
}

/**
 * EventCommandのインスタンス
 */
export const eventCommand = new EventCommand();
