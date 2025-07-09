import {
  ModalSubmitInteraction,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { ModalActionInteraction } from '../../base/action_base.js';
import { hostRequestManager } from '../../../event/HostRequestManager.js';
import { logger } from '../../../utils/log.js';

/**
 * 主催別日提案モーダルアクション
 * host_alternate_modal_{hostRequestId}
 */
export class HostAlternateModalAction extends ModalActionInteraction {
  customIdPattern = /^host_alternate_modal_(\d+)$/;

  /**
   * コンストラクタ
   */
  constructor() {
    super('host_alternate_modal');
  }

  /**
   * モーダルビルダーの作成
   * @param hostRequestId ホストリクエストID
   * @param _eventName イベント名（未使用）
   * @returns ModalBuilder
   */
  create(hostRequestId: number, _eventName: string): ModalBuilder {
    const modal = new ModalBuilder()
      .setCustomId(`host_alternate_modal_${hostRequestId}`)
      .setTitle('別日提案');

    const proposedDateInput = new TextInputBuilder()
      .setCustomId('proposed_date')
      .setLabel('提案する日程')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('例: 2024/1/15 20:00 または 来週火曜日')
      .setRequired(true)
      .setMaxLength(100);

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('理由・備考（任意）')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('指定日時の都合が悪い理由や、提案理由をお書きください')
      .setRequired(false)
      .setMaxLength(500);

    const firstActionRow = new ActionRowBuilder<TextInputBuilder>()
      .addComponents(proposedDateInput);
    const secondActionRow = new ActionRowBuilder<TextInputBuilder>()
      .addComponents(reasonInput);

    modal.addComponents(firstActionRow, secondActionRow);

    return modal;
  }

  /**
   * モーダル送信時の処理
   * @param interaction インタラクション
   * @param _params URLSearchParams（未使用）
   * @returns Promise<void>
   */
  async onCommand(interaction: ModalSubmitInteraction<'cached'>, _params: URLSearchParams): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      // カスタムIDからホストリクエストIDを抽出
      const match = this.customIdPattern.exec(interaction.customId);
      if (!match) {
        await interaction.editReply({
          content: 'エラー: 無効なモーダルIDです。',
        });
        return;
      }

      const hostRequestId = parseInt(match[1]);

      // お伺いリクエストを取得
      const hostRequest = await hostRequestManager.getRequest(hostRequestId);
      if (!hostRequest) {
        await interaction.editReply({
          content: 'エラー: お伺いリクエストが見つかりません。',
        });
        return;
      }

      // 入力値を取得
      const proposedDate = interaction.fields.getTextInputValue('proposed_date');
      const reason = interaction.fields.getTextInputValue('reason') || undefined;

      // 元のDMメッセージを更新（モーダル経由なのでDM更新はスキップ）
      
      // 管理チャンネルに通知
      logger.info(`別日提案: ${proposedDate}${reason ? `, 理由: ${reason}` : ''}`);
      // TODO: 管理チャンネル通知機能の実装

      // ユーザーに確認メッセージ
      const embed = new EmbedBuilder()
        .setTitle('📅 別日提案完了')
        .setDescription(
          `**${hostRequest.event.name}** について別日程を提案いたしました。\n\n` +
          `**提案日時**: ${proposedDate}` +
          (reason ? `\n**理由**: ${reason}` : '') + '\n\n' +
          '管理者に通知が送信されました。回答をお待ちください。'
        )
        .setColor(0xf39c12)
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed],
      });

      logger.info(
        `別日提案が完了しました: User=${interaction.user.username}, Event=${hostRequest.event.name}, ProposedDate=${proposedDate}`,
      );

    } catch (error) {
      logger.error('別日提案処理でエラー:', error);
      await interaction.editReply({
        content: 'エラーが発生しました。管理者にお問い合わせください。',
      });
    }
  }
}

export default new HostAlternateModalAction(); 