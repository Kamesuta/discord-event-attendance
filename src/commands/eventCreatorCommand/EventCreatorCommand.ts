import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { CommandGroupInteraction } from '../base/commandBase.js';

class EventCreatorCommand extends CommandGroupInteraction {
  command = new SlashCommandBuilder()
    .setDescription('イベント作成者用コマンド')
    .setName('event_creator')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);
}

/**
 * EventCreatorCommandのインスタンス
 */
export const eventCreatorCommand = new EventCreatorCommand();
