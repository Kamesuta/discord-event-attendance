import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { CommandGroupInteraction } from '../base/commandBase.js';

class EventAdminCommand extends CommandGroupInteraction {
  command = new SlashCommandBuilder()
    .setDescription('イベント管理者用コマンド')
    .setName('event_admin')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);
}

/**
 * EventAdminCommandのインスタンス
 */
export const eventAdminCommand = new EventAdminCommand();
