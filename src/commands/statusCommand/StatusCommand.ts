import { SlashCommandBuilder } from 'discord.js';
import { CommandGroupInteraction } from '@/commands/base/commandBase';

class StatusCommand extends CommandGroupInteraction {
  command = new SlashCommandBuilder()
    .setName('status')
    .setDescription('イベント参加状況を確認');
}

/**
 * StatusCommandのインスタンス
 */
export const statusCommand = new StatusCommand();
