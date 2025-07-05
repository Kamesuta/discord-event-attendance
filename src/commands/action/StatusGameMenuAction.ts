import {
  ComponentType,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';
import { MessageComponentActionInteraction } from '../base/action_base.js';
import { Event } from '@prisma/client';
import { GameResultData, showGameResults } from '../../event/game.js';
import { prisma } from '../../utils/prisma.js';

class StatusGameMenuAction extends MessageComponentActionInteraction<ComponentType.StringSelect> {
  /**
   * 出席/欠席ユーザー選択メニューを作成
   * @param event イベント
   * @param gameResults ゲーム結果
   * @returns 作成したビルダー
   */
  override create(
    event: Event,
    gameResults: GameResultData[],
  ): StringSelectMenuBuilder {
    // カスタムIDを生成
    const customId = this.createCustomId({
      event: `${event.id}`,
    });

    // ダイアログを作成
    return new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('確認したい試合結果を選択')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        gameResults.map((game) => ({
          label: `${game.name} (試合ID: ${game.id})`,
          value: game.id.toString(),
        })),
      );
  }

  /** @inheritdoc */
  async onCommand(
    interaction: StringSelectMenuInteraction,
    params: URLSearchParams,
  ): Promise<void> {
    const eventId = params.get('event');
    if (!eventId) return; // 必要なパラメータがない場合は旧形式の可能性があるため無視

    await interaction.deferReply({ ephemeral: true });
    // ゲーム結果を取得
    const gameId = parseInt(interaction.values[0]);
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

export default new StatusGameMenuAction(
  'status_game',
  ComponentType.StringSelect,
);
