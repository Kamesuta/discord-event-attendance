import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import { logger } from '../../../utils/log.js';
import eventHostPlanCommand, {
  PlanSetupData,
} from '../../event_host_command/EventHostPlanCommand.js';
import {
  hostWorkflowManager,
  HostWorkflowWithRelations,
} from '../../../event/HostWorkflowManager.js';
import { hostRequestManager } from '../../../event/HostRequestManager.js';
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
        // 既存ワークフローを更新
        await this._updateExistingWorkflow(existingWorkflow, setupData);

        // 既存の候補者リクエストを削除
        await prisma.hostRequest.deleteMany({
          where: {
            eventId: eventIdNum,
            status: 'pending', // pendingのもののみ削除
          },
        });

        // 新しい候補者のHostRequestを作成
        for (let i = 0; i < setupData.candidates.length; i++) {
          const candidate = setupData.candidates[i];
          await hostRequestManager.createRequest(
            eventIdNum,
            candidate.id, // Userテーブルのid（数値）を使用
            i + 1, // priority: 1番手、2番手、3番手
            setupData.customMessage,
          );
        }

        await interaction.editReply({
          content:
            `⚙️ イベント「${event.name}」のワークフローを更新しました。\n` +
            `候補者: ${setupData.candidates.map((user, index) => `${index + 1}.${user.userId}`).join(' ')}\n` +
            `並行公募: ${setupData.allowPublicApply ? 'あり' : 'なし'}\n` +
            `メッセージ: ${setupData.customMessage}`,
        });
      } else {
        // 新規ワークフローを作成
        await hostWorkflowManager.createWorkflow(
          eventIdNum,
          setupData.allowPublicApply,
          setupData.customMessage,
        );

        // 候補者のHostRequestを作成
        for (let i = 0; i < setupData.candidates.length; i++) {
          const candidate = setupData.candidates[i];
          await hostRequestManager.createRequest(
            eventIdNum,
            candidate.id, // Userテーブルのid（数値）を使用
            i + 1, // priority: 1番手、2番手、3番手
            setupData.customMessage,
          );
        }

        await interaction.editReply({
          content:
            `✅ イベント「${event.name}」の主催者お伺いワークフローを作成しました。\n` +
            `候補者: ${setupData.candidates.map((user, index) => `${index + 1}.${user.userId}`).join(' ')}\n` +
            `並行公募: ${setupData.allowPublicApply ? 'あり' : 'なし'}\n` +
            `メッセージ: ${setupData.customMessage}`,
        });
      }

      // 設定データをクリア
      await eventHostPlanCommand.getSetupData(interaction, eventIdNum, true);

      // 少し待ってからパネル更新（DB操作完了を確実にするため）
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 計画作成パネルを更新
      await eventHostPlanCommand.updatePlanningPanelFromAction(interaction);
    } catch (error) {
      logger.error('確定処理でエラー:', error);
      await interaction.editReply({
        content:
          'エラーが発生しました。しばらく時間をおいて再試行してください。',
      });
    }
  }

  /**
   * 既存ワークフローを更新
   * @param existingWorkflow 既存ワークフロー
   * @param setupData 設定データ
   * @returns Promise<void>
   */
  private async _updateExistingWorkflow(
    existingWorkflow: HostWorkflowWithRelations,
    setupData: PlanSetupData,
  ): Promise<void> {
    try {
      // ワークフローの設定を更新
      await prisma.hostWorkflow.update({
        where: { id: existingWorkflow.id },
        data: {
          allowPublicApply: setupData.allowPublicApply,
          customMessage: setupData.customMessage,
          // ステータスは現状維持
        },
      });
    } catch (error) {
      logger.error('ワークフロー更新でエラー:', error);
      throw error;
    }
  }
}

export default new PlanConfirmButtonAction('hpco', ComponentType.Button);
