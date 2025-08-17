import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import { logger } from '../../../utils/log.js';

/**
 * 主催者お伺いワークフロー計画作成 - キャンセルボタンアクション
 */
class PlanCancelButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  /**
   * キャンセルボタンを作成
   * @returns 作成したビルダー
   */
  override create(): ButtonBuilder {
    // カスタムIDを生成
    const customId = this.createCustomId();

    // ボタンを作成
    return new ButtonBuilder()
      .setCustomId(customId)
      .setLabel('キャンセル')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('❌');
  }

  /**
   * キャンセル処理
   * @param interaction インタラクション
   * @param _params URLパラメータ
   * @returns Promise<void>
   */
  async onCommand(
    interaction: ButtonInteraction,
    _params: URLSearchParams,
  ): Promise<void> {
    try {
      // 元のメッセージを削除（パネル削除）
      try {
        await interaction.message.delete();
        // パネルが削除されたら、確認メッセージも不要
        await interaction.deferReply({ ephemeral: true });
        await interaction.deleteReply();
      } catch (error) {
        // 削除に失敗した場合は通常のreplyで対応
        logger.debug('メッセージの削除に失敗しました:', error);
        await interaction.deferReply({ ephemeral: true });
        await interaction.editReply({
          content: 'キャンセルしました。',
        });
      }
    } catch (error) {
      logger.error('キャンセル処理でエラー:', error);
      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply({
        content: 'エラーが発生しました。',
      });
    }
  }
}

export default new PlanCancelButtonAction('hpca', ComponentType.Button);
