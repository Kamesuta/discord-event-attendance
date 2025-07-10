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
    await interaction.deferReply({ ephemeral: true });

    try {
      await interaction.editReply({
        content: '計画作成をキャンセルしました。',
      });

      // 元のメッセージを削除（可能であれば）
      try {
        await interaction.message.delete();
      } catch (error) {
        // 削除に失敗した場合は無視（権限がない場合等）
        logger.debug('メッセージの削除に失敗しました:', error);
      }
    } catch (error) {
      logger.error('キャンセル処理でエラー:', error);
      await interaction.editReply({
        content: 'エラーが発生しました。',
      });
    }
  }
}

export default new PlanCancelButtonAction('hpca', ComponentType.Button);
