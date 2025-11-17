import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import { statusCommand } from './StatusCommand.js';
import { prisma } from '../../utils/prisma.js';
import { showGameResults } from '../../event/game.js';

class StatusGameCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('game')
    .setDescription('ゲームの勝敗を表示')
    .addIntegerOption((option) =>
      option.setName('game_id').setDescription('試合ID').setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName('show')
        .setDescription(
          'コマンドの結果をチャットに表示しますか？ (デフォルトは非公開)',
        )
        .setRequired(false),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // ゲームの勝敗を表示
    const show = interaction.options.getBoolean('show') ?? false;
    await interaction.deferReply({ ephemeral: !show });
    const gameId = interaction.options.getInteger('game_id');
    const game = await prisma.gameResult.findFirst({
      where: {
        id: gameId ?? undefined,
      },
    });
    if (!game) {
      await interaction.editReply({
        content: '試合が見つかりませんでした',
      });
      return;
    }
    await showGameResults(interaction, game.id);
  }
}

/**
 * StatusGameCommandのインスタンス
 */
export const statusGameCommand = new StatusGameCommand(statusCommand);
