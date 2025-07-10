import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
  ActionRowBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import { logger } from '../../../utils/log.js';
import eventHostPlanCommand from '../../event_host_command/EventHostPlanCommand.js';
import planCandidateUserSelectAction from './PlanCandidateUserSelectAction.js';

/**
 * 主催者お伺いワークフロー計画作成 - 候補者選択ボタンアクション
 */
class PlanCandidateSelectButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  /**
   * 候補者選択ボタンを作成
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
      .setLabel('候補者選択')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('👥');
  }

  /**
   * 候補者選択処理
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
      // 設定データを取得
      const key = new URLSearchParams({
        user: interaction.user.id,
        event: eventId,
      }).toString();

      const _setupData = await eventHostPlanCommand.getSetupData(
        key,
        parseInt(eventId),
      );

      // ユーザーセレクトメニューを作成
      const userSelect = planCandidateUserSelectAction.create(
        parseInt(eventId),
      );

      const selectRow =
        new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userSelect);

      await interaction.editReply({
        content: '候補者を1～3人選択してください（優先順位順）：',
        components: [selectRow],
      });
    } catch (error) {
      logger.error('候補者選択処理でエラー:', error);
      await interaction.editReply({
        content:
          'エラーが発生しました。しばらく時間をおいて再試行してください。',
      });
    }
  }
}

export default new PlanCandidateSelectButtonAction(
  'hpcs',
  ComponentType.Button,
);
