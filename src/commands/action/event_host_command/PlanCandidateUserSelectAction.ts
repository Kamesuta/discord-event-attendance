import {
  ComponentType,
  UserSelectMenuBuilder,
  UserSelectMenuInteraction,
} from 'discord.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import { logger } from '../../../utils/log.js';
import eventHostPlanCommand from '../../event_host_command/EventHostPlanCommand.js';
import { prisma } from '../../../utils/prisma.js';

/**
 * 主催者お伺いワークフロー計画作成 - 候補者ユーザーセレクトアクション
 */
class PlanCandidateUserSelectAction extends MessageComponentActionInteraction<ComponentType.UserSelect> {
  /**
   * ユーザーセレクトメニューを作成
   * @param eventId イベントID
   * @returns 作成したビルダー
   */
  override create(eventId?: number): UserSelectMenuBuilder {
    // カスタムIDを生成
    const customId = this.createCustomId({
      evt: eventId?.toString() ?? '0',
    });

    // ユーザーセレクトメニューを作成
    return new UserSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('候補者を1～3人選択してください')
      .setMinValues(1)
      .setMaxValues(3);
  }

  /**
   * ユーザー選択処理
   * @param interaction インタラクション
   * @param params URLパラメータ
   * @returns Promise<void>
   */
  async onCommand(
    interaction: UserSelectMenuInteraction,
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
      const key = new URLSearchParams({
        user: interaction.user.id,
        event: eventIdNum.toString(),
      }).toString();

      const setupData = await eventHostPlanCommand.getSetupData(
        key,
        eventIdNum,
      );

      // 選択されたユーザーを取得
      const selectedUserIds = interaction.values;
      const selectedUsers = await prisma.user.findMany({
        where: {
          userId: {
            in: selectedUserIds,
          },
        },
      });

      // 設定データを更新
      eventHostPlanCommand.setSetupData(setupData, {
        candidates: selectedUsers,
      });

      await interaction.editReply({
        content:
          `候補者を${selectedUsers.length}人選択しました。\n` +
          selectedUsers
            .map((user, index) => `${index + 1}. <@${user.userId}>`)
            .join('\n'),
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

export default new PlanCandidateUserSelectAction('', ComponentType.UserSelect);
