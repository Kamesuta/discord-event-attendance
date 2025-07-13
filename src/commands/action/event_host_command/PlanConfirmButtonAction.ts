import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import { logger } from '../../../utils/log.js';
import eventHostPlanCommand from '../../event_host_command/EventHostPlanCommand.js';
import { hostWorkflowManager } from '../../../event/HostWorkflowManager.js';
import { prisma } from '../../../utils/prisma.js';

/**
 * 主催者お伺いワークフロー設定 - 確定ボタンアクション
 */
class PlanConfirmButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  /**
   * 確定ボタンを作成
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
      .setLabel('確定')
      .setStyle(ButtonStyle.Primary);
  }

  /**
   * 確定処理
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

      // 設定データを取得
      const setupData = await eventHostPlanCommand.getSetupData(
        interaction,
        eventIdNum,
      );

      // 候補者が設定されているかチェック
      if (setupData.candidates.length === 0) {
        await interaction.editReply({
          content:
            '候補者が設定されていません。1番手から3番手までの候補者を設定してください。',
        });
        return;
      }

      // イベント情報を取得
      const event = await prisma.event.findUnique({
        where: { id: eventIdNum },
      });

      if (!event) {
        await interaction.editReply({
          content: 'イベントが見つかりませんでした。',
        });
        return;
      }

      // 既存のワークフローをチェック
      const existingWorkflow =
        await hostWorkflowManager.getWorkflow(eventIdNum);
      if (existingWorkflow) {
        await interaction.editReply({
          content: `イベント「${event.name}」は既にワークフローが作成されています。`,
        });
        return;
      }

      // ワークフローを作成
      await hostWorkflowManager.createWorkflow(
        eventIdNum,
        setupData.allowPublicApply,
        setupData.customMessage,
      );

      // 設定データをクリア
      await eventHostPlanCommand.getSetupData(interaction, eventIdNum, true);

      // 計画作成パネルを更新
      await eventHostPlanCommand.updatePlanningPanelFromAction(interaction);

      await interaction.editReply({
        content:
          `✅ イベント「${event.name}」の主催者お伺いワークフローを作成しました。\n` +
          `候補者: ${setupData.candidates.map((user, index) => `${index + 1}.${user.userId}`).join(' ')}\n` +
          `並行公募: ${setupData.allowPublicApply ? 'あり' : 'なし'}\n` +
          `メッセージ: ${setupData.customMessage}`,
      });
    } catch (error) {
      logger.error('確定処理でエラー:', error);
      await interaction.editReply({
        content:
          'エラーが発生しました。しばらく時間をおいて再試行してください。',
      });
    }
  }
}

export default new PlanConfirmButtonAction('hpco', ComponentType.Button);
