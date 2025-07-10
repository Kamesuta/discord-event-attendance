import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
} from 'discord.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import { logger } from '../../../utils/log.js';
import { hostWorkflowManager } from '../../../event/HostWorkflowManager.js';
import { prisma } from '../../../utils/prisma.js';

/**
 * 主催者お伺いワークフロー計画作成 - 全てのイベントで計画作成ボタンアクション
 */
class PlanSetupAllButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  /**
   * 全てのイベントで計画作成ボタンを作成
   * @returns 作成したビルダー
   */
  override create(): ButtonBuilder {
    // カスタムIDを生成
    const customId = this.createCustomId();

    // ボタンを作成
    return new ButtonBuilder()
      .setCustomId(customId)
      .setLabel('全てのイベントで計画作成')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🚀');
  }

  /**
   * 全てのイベントで計画作成処理
   * @param interaction インタラクション
   * @param _params URLパラメータ
   * @returns Promise<void>
   */
  async onCommand(
    interaction: ButtonInteraction,
    _params: URLSearchParams,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      // 主催者が決まっていないイベントを取得
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);

      const events = await prisma.event.findMany({
        where: {
          active: 1, // アクティブなイベント
          hostId: null, // 主催者が決まっていない
          scheduleTime: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: {
          scheduleTime: 'asc',
        },
      });

      if (events.length === 0) {
        await interaction.editReply({
          content: '主催者が決まっていないイベントが見つかりませんでした。',
        });
        return;
      }

      // 全てのイベントに対してワークフローを作成
      const results = await Promise.allSettled(
        events.map(async (event) => {
          const existingWorkflow = await hostWorkflowManager.getWorkflow(
            event.id,
          );
          if (existingWorkflow) {
            return {
              eventId: event.id,
              status: 'exists',
              eventName: event.name,
            };
          }

          // ワークフロー作成（具体的な実装は後で追加）
          await hostWorkflowManager.createWorkflow(event.id);
          return {
            eventId: event.id,
            status: 'created',
            eventName: event.name,
          };
        }),
      );

      // 結果を集計
      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const alreadyExists = results.filter(
        (r) =>
          r.status === 'fulfilled' &&
          r.value &&
          typeof r.value === 'object' &&
          'status' in r.value &&
          r.value.status === 'exists',
      ).length;
      const created = successful - alreadyExists;

      const embed = new EmbedBuilder()
        .setTitle('🚀 ワークフロー計画作成完了')
        .setDescription(
          `${events.length}件のイベントに対して計画作成を実行しました。`,
        )
        .addFields(
          {
            name: '新規作成',
            value: `${created}件`,
            inline: true,
          },
          {
            name: '既存スキップ',
            value: `${alreadyExists}件`,
            inline: true,
          },
          {
            name: '合計',
            value: `${successful}件`,
            inline: true,
          },
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      logger.error('全てのイベントで計画作成処理でエラー:', error);
      await interaction.editReply({
        content:
          'エラーが発生しました。しばらく時間をおいて再試行してください。',
      });
    }
  }
}

export default new PlanSetupAllButtonAction('hpsa', ComponentType.Button);
