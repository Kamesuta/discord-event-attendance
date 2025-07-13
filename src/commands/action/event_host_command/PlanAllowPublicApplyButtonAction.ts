import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
  ActionRowBuilder,
  MessageActionRowComponentBuilder,
} from 'discord.js';
import { Event } from '@prisma/client';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import { logger } from '../../../utils/log.js';
import eventHostPlanCommand, {
  PlanSetupData,
} from '../../event_host_command/EventHostPlanCommand.js';
import { prisma } from '../../../utils/prisma.js';

/**
 * 主催者お伺いワークフロー設定 - 並行公募切り替えボタンアクション
 */
class PlanAllowPublicApplyButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  /**
   * 並行公募切り替えボタンを作成
   * @param eventId イベントID
   * @param allowPublicApply 現在の並行公募設定
   * @returns 作成したビルダー
   */
  override create(eventId: number, allowPublicApply: boolean): ButtonBuilder {
    // カスタムIDを生成
    const customId = this.createCustomId({
      evt: eventId.toString(),
    });

    // ボタンを作成
    return new ButtonBuilder()
      .setCustomId(customId)
      .setLabel(`並行公募: ${allowPublicApply ? 'はい' : 'いいえ'}`)
      .setStyle(allowPublicApply ? ButtonStyle.Success : ButtonStyle.Secondary);
  }

  /**
   * 並行公募切り替え処理
   * @param interaction インタラクション
   * @param params URLパラメータ
   * @returns Promise<void>
   */
  async onCommand(
    interaction: ButtonInteraction,
    params: URLSearchParams,
  ): Promise<void> {
    const eventId = params.get('evt');
    if (!eventId) {
      await interaction.reply({
        content: 'イベントIDが見つかりませんでした。',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferUpdate();

    try {
      const eventIdNum = parseInt(eventId);

      if (isNaN(eventIdNum)) {
        await interaction.followUp({
          content: 'イベントIDが無効です。',
          ephemeral: true,
        });
        return;
      }

      // 設定データを取得
      const setupData = await eventHostPlanCommand.getSetupData(
        interaction,
        eventIdNum,
      );

      // 並行公募設定を切り替え
      setupData.allowPublicApply = !setupData.allowPublicApply;

      // イベント情報を取得
      const event = await prisma.event.findUnique({
        where: { id: eventIdNum },
      });

      if (!event) {
        await interaction.followUp({
          content: 'イベントが見つかりませんでした。',
          ephemeral: true,
        });
        return;
      }

      // 設定パネルを更新
      await this._updateSetupPanel(interaction, event, setupData);

      // 計画作成パネルも更新
      await eventHostPlanCommand.updatePlanningPanelFromAction(interaction);
    } catch (error) {
      logger.error('並行公募切り替え処理でエラー:', error);
      await interaction.followUp({
        content:
          'エラーが発生しました。しばらく時間をおいて再試行してください。',
        ephemeral: true,
      });
    }
  }

  /**
   * 設定パネルを更新
   * @param interaction インタラクション
   * @param event イベント
   * @param setupData 設定データ
   * @returns Promise<void>
   */
  private async _updateSetupPanel(
    interaction: ButtonInteraction,
    event: Event,
    setupData: PlanSetupData,
  ): Promise<void> {
    try {
      const embed = eventHostPlanCommand.makeSetupEmbed(event, setupData);
      const components = this._createSetupPanelComponents(event.id, setupData);

      await interaction.editReply({
        embeds: [embed],
        components,
      });
    } catch (error) {
      logger.error('設定パネル更新でエラー:', error);
      // フォールバック: 基本的な更新のみ
      const embed = eventHostPlanCommand.makeSetupEmbed(event, setupData);
      await interaction.editReply({
        embeds: [embed],
      });
    }
  }

  /**
   * 設定パネルのコンポーネントを作成
   * @param eventId イベントID
   * @param setupData 設定データ
   * @returns ActionRowBuilder[]
   */
  private _createSetupPanelComponents(
    eventId: number,
    setupData: PlanSetupData,
  ): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
    return eventHostPlanCommand.createSetupPanelComponents(eventId, setupData);
  }
}

export default new PlanAllowPublicApplyButtonAction(
  'hpat',
  ComponentType.Button,
);
