import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import { logger } from '../../../utils/log.js';
import eventHostPlanCommand from '../../event_host_command/EventHostPlanCommand.js';

/**
 * 主催者お伺いワークフロー設定 - 依頼メッセージ編集ボタンアクション
 */
class PlanMessageEditButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  /**
   * 依頼メッセージ編集ボタンを作成
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
      .setLabel('依頼メッセージ編集')
      .setStyle(ButtonStyle.Secondary);
  }

  /**
   * 依頼メッセージ編集処理
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

    try {
      const eventIdNum = parseInt(eventId);

      if (isNaN(eventIdNum)) {
        await interaction.reply({
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

      // モーダルを作成
      const modalCustomId = new URLSearchParams({
        // eslint-disable-next-line @typescript-eslint/naming-convention
        _: 'hpme_modal',
        // eslint-disable-next-line @typescript-eslint/naming-convention
        _t: 'm',
        evt: eventIdNum.toString(),
      }).toString();

      const modal = new ModalBuilder()
        .setCustomId(modalCustomId)
        .setTitle('依頼メッセージ編集');

      // テキスト入力フィールドを作成
      const messageInput = new TextInputBuilder()
        .setCustomId('custom_message')
        .setLabel('依頼メッセージ')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('よろしくお願いいたします。')
        .setValue(setupData.customMessage)
        .setRequired(false)
        .setMaxLength(1000);

      const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
        messageInput,
      );

      modal.addComponents(actionRow);

      // モーダルを表示
      await interaction.showModal(modal);
    } catch (error) {
      logger.error('依頼メッセージ編集処理でエラー:', error);
      await interaction.reply({
        content:
          'エラーが発生しました。しばらく時間をおいて再試行してください。',
        ephemeral: true,
      });
    }
  }
}

export default new PlanMessageEditButtonAction('hpme', ComponentType.Button);
