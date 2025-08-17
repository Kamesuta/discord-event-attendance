import { ModalSubmitInteraction, ModalBuilder } from 'discord.js';
import { Event } from '@prisma/client';
import { ModalActionInteraction } from '../../base/action_base.js';
import { logger } from '../../../utils/log.js';
import eventHostPlanCommand, {
  PlanSetupData,
} from '../../event_host_command/EventHostPlanCommand.js';
import { prisma } from '../../../utils/prisma.js';

/**
 * 主催者お伺いワークフロー設定 - 依頼メッセージ編集モーダルアクション
 */
class PlanMessageEditModalAction extends ModalActionInteraction {
  /**
   * モーダルビルダーを作成（このクラスでは使用しない）
   */
  override create(): ModalBuilder {
    // このメソッドは使用しないが、抽象メソッドなので実装が必要
    throw new Error('このメソッドは使用しません');
  }
  /**
   * モーダル送信処理
   * @param interaction インタラクション
   * @param params URLパラメータ
   * @returns Promise<void>
   */
  async onCommand(
    interaction: ModalSubmitInteraction,
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

      // 入力されたメッセージを取得
      const customMessage =
        interaction.fields.getTextInputValue('custom_message') || '';

      // 設定データを取得
      const setupData = await eventHostPlanCommand.getSetupData(
        interaction,
        eventIdNum,
      );

      // 設定データを更新
      setupData.customMessage = customMessage;

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
      logger.error('依頼メッセージ編集モーダル処理でエラー:', error);
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
    interaction: ModalSubmitInteraction,
    event: Event,
    setupData: PlanSetupData,
  ): Promise<void> {
    try {
      const embed = eventHostPlanCommand.makeSetupEmbed(event, setupData);
      const components = eventHostPlanCommand.createSetupPanelComponents(
        event.id,
        setupData,
      );

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
}

export default new PlanMessageEditModalAction('hpme_modal');
