import { SlashCommandBuilder } from 'discord.js';
import { CommandGroupInteraction } from '../base/command_base.js';

class StatusCommand extends CommandGroupInteraction {
  command = new SlashCommandBuilder()
    .setName('status')
    .setDescription('イベント参加状況を確認');
}

/**
 * StatusCommandのインスタンス
 */
export const statusCommand = new StatusCommand();
