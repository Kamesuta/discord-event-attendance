import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import { logger } from '../../../utils/log.js';
import eventHostPlanCommand from '../../event_host_command/EventHostPlanCommand.js';

/**
 * 主催者お伺いワークフロー設定 - キャンセルボタンアクション
 */
class PlanCancelSetupButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  /**
   * キャンセルボタンを作成
   * @param eventId イベントID
   * @returns 作成したビルダー
   */
  override create(eventId: number): ButtonBuilder {
    // カスタムIDを生成
    const customId = this.createCustomId({
      evt: eventId.toString(),
    });

    // ボタンを作成
    return new ButtonBuilder()
      .setCustomId(customId)
      .setLabel('キャンセル')
      .setStyle(ButtonStyle.Danger);
  }

  /**
   * キャンセル処理
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

    await interaction.deferReply({ ephemeral: true });

    try {
      const eventIdNum = parseInt(eventId);

      if (isNaN(eventIdNum)) {
        await interaction.editReply({
          content: 'イベントIDが無効です。',
        });
        return;
      }

      // 設定データをクリア
      await eventHostPlanCommand.getSetupData(interaction, eventIdNum, true);

      // 計画作成パネルを更新
      await eventHostPlanCommand.updatePlanningPanelFromAction(interaction);

      await interaction.editReply({
        content: '設定をキャンセルしました。',
      });
    } catch (error) {
      logger.error('キャンセル処理でエラー:', error);
      await interaction.editReply({
        content:
          'エラーが発生しました。しばらく時間をおいて再試行してください。',
      });
    }
  }
}

export default new PlanCancelSetupButtonAction('hpca', ComponentType.Button);
