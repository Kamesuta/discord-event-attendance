import {
  ButtonInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
} from 'discord.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import {
  hostRequestManager,
  HostRequestWithRelations,
} from '../../../event/HostRequestManager.js';
import { config } from '../../../utils/config.js';
import { client } from '../../../utils/client.js';
import { logger } from '../../../utils/log.js';

/**
 * 主催別日提案ボタンアクション
 * host_alternate_{hostRequestId}
 */
export class HostAlternateButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  customIdPattern = /^host_alternate_(\d+)$/;

  /**
   * コンストラクタ
   */
  constructor() {
    super('host_alternate', ComponentType.Button);
  }

  /**
   * ビルダーの作成
   * @param hostRequestId ホストリクエストID
   * @returns ButtonBuilder
   */
  create(hostRequestId: number): ButtonBuilder {
    return new ButtonBuilder()
      .setCustomId(`host_alternate_${hostRequestId}`)
      .setLabel('別日を提案')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📅');
  }

  /**
   * ボタン実行
   * @param interaction インタラクション
   * @param _params URLSearchParams（未使用）
   * @returns Promise<void>
   */
  async onCommand(
    interaction: ButtonInteraction<'cached'>,
    _params: URLSearchParams,
  ): Promise<void> {
    try {
      // カスタムIDからホストリクエストIDを抽出
      const match = this.customIdPattern.exec(interaction.customId);
      if (!match) {
        await interaction.reply({
          content: 'エラー: 無効なボタンIDです。',
          ephemeral: true,
        });
        return;
      }

      const hostRequestId = parseInt(match[1]);

      // お伺いリクエストを取得
      const hostRequest = await hostRequestManager.getRequest(hostRequestId);
      if (!hostRequest) {
        await interaction.reply({
          content: 'エラー: お伺いリクエストが見つかりません。',
          ephemeral: true,
        });
        return;
      }

      // 既に回答済みかチェック
      if (hostRequest.status !== 'PENDING') {
        await interaction.reply({
          content: `この依頼は既に${this._getStatusText(hostRequest.status)}済みです。`,
          ephemeral: true,
        });
        return;
      }

      // 期限切れチェック
      if (hostRequestManager.isExpired(hostRequest)) {
        await interaction.reply({
          content: '申し訳ございませんが、回答期限が過ぎています。',
          ephemeral: true,
        });
        return;
      }

      // ユーザーIDチェック
      if (hostRequest.user.id !== parseInt(interaction.user.id)) {
        await interaction.reply({
          content: 'エラー: このお伺いは他のユーザー宛てです。',
          ephemeral: true,
        });
        return;
      }

      // 別日提案モーダルを表示
      await this._showAlternateModal(
        interaction,
        hostRequestId,
        hostRequest.workflow.event.name,
      );
    } catch (error) {
      logger.error('別日提案ボタン処理でエラー:', error);
      await interaction.reply({
        content: 'エラーが発生しました。管理者にお問い合わせください。',
        ephemeral: true,
      });
    }
  }

  /**
   * 別日提案モーダルを表示
   * @param interaction インタラクション
   * @param hostRequestId お伺いリクエストID
   * @param _eventName イベント名（未使用）
   * @returns Promise<void>
   */
  private async _showAlternateModal(
    interaction: ButtonInteraction,
    hostRequestId: number,
    _eventName: string,
  ): Promise<void> {
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

    const firstActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(proposedDateInput);
    const secondActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);

    modal.addComponents(firstActionRow, secondActionRow);

    await interaction.showModal(modal);
  }

  /**
   * 元のDMメッセージを更新（別日提案済み）
   * @param interaction インタラクション
   * @param hostRequest お伺いリクエスト
   * @param proposedDate 提案日時
   * @param reason 理由
   * @returns Promise<void>
   */
  async updateOriginalDMMessage(
    interaction: ButtonInteraction,
    hostRequest: HostRequestWithRelations,
    proposedDate: string,
    reason?: string,
  ): Promise<void> {
    try {
      const embed = new EmbedBuilder()
        .setTitle('🎯 イベント主催のお伺い')
        .setDescription(
          `**${hostRequest.workflow.event.name}** の主催をお願いできませんでしょうか？\n\n` +
            (hostRequest.message || 'よろしくお願いいたします。') +
            '\n\n' +
            `**📅 別日提案済み** (${new Date().toLocaleString('ja-JP')})\n` +
            `**提案日時**: ${proposedDate}` +
            (reason ? `\n**理由**: ${reason}` : ''),
        )
        .addFields(
          {
            name: 'イベント情報',
            value:
              `📅 **開催予定**: ${
                hostRequest.workflow.event.scheduleTime
                  ? new Date(
                      hostRequest.workflow.event.scheduleTime,
                    ).toLocaleString('ja-JP')
                  : '未定'
              }\n` + `🆔 **イベントID**: ${hostRequest.workflow.event.id}`,
            inline: false,
          },
          {
            name: '状態',
            value: '📅 別日提案済み',
            inline: true,
          },
          {
            name: '📋 優先順位',
            value: `第${hostRequest.priority}候補`,
            inline: true,
          },
        )
        .setColor(0xf39c12)
        .setFooter({
          text: `HostRequest:${hostRequest.id} | Event:${hostRequest.workflow.event.id} | User:${hostRequest.userId}`,
        })
        .setTimestamp();

      // ボタンを無効化
      const disabledButtons =
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('disabled_accept')
            .setLabel('主催を受諾')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId('disabled_decline')
            .setLabel('お断りする')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId('disabled_alternate')
            .setLabel('別日提案済み')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📅')
            .setDisabled(true),
        );

      // 元のメッセージを取得して更新
      const dmChannel =
        interaction.user.dmChannel || (await interaction.user.createDM());
      if (hostRequest.dmMessageId) {
        try {
          const originalMessage = await dmChannel.messages.fetch(
            hostRequest.dmMessageId,
          );
          await originalMessage.edit({
            embeds: [embed],
            components: [disabledButtons],
          });
        } catch (error) {
          logger.error('元DMメッセージの更新でエラー:', error);
        }
      }
    } catch (error) {
      logger.error('元DMメッセージの更新でエラー:', error);
    }
  }

  /**
   * 管理チャンネルに通知
   * @param hostRequest お伺いリクエスト
   * @param proposedDate 提案日時
   * @param reason 理由
   * @returns Promise<void>
   */
  async notifyManagementChannel(
    hostRequest: HostRequestWithRelations,
    proposedDate: string,
    reason?: string,
  ): Promise<void> {
    try {
      const managementChannel = client.channels.cache.get(
        config.host_request_channel_id,
      );
      if (!managementChannel?.isTextBased() || !('send' in managementChannel)) {
        logger.warn(
          '管理チャンネルが見つからないか、テキストチャンネルではありません',
        );
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('📅 別日提案通知')
        .setDescription(
          `**${hostRequest.workflow.event.name}** の主催について別日提案がありました。`,
        )
        .addFields(
          {
            name: 'ユーザー',
            value: `${hostRequest.user.memberName || hostRequest.user.username}`,
            inline: true,
          },
          {
            name: 'イベント',
            value: `${hostRequest.workflow.event.name} (ID: ${hostRequest.workflow.event.id})`,
            inline: false,
          },
          {
            name: '元の開催予定',
            value: hostRequest.workflow.event.scheduleTime
              ? new Date(
                  hostRequest.workflow.event.scheduleTime,
                ).toLocaleString('ja-JP')
              : '未定',
            inline: true,
          },
          {
            name: '提案日時',
            value: proposedDate,
            inline: true,
          },
          {
            name: '優先順位',
            value: `第${hostRequest.priority}候補`,
            inline: true,
          },
        )
        .setColor(0xf39c12)
        .setTimestamp();

      if (reason) {
        embed.addFields({
          name: '理由・備考',
          value: reason,
          inline: false,
        });
      }

      await managementChannel.send({
        embeds: [embed],
      });
    } catch (error) {
      logger.error('管理チャンネル通知の送信でエラー:', error);
    }
  }

  /**
   * 状態を日本語に変換
   * @param status 状態
   * @returns 日本語状態
   */
  private _getStatusText(status: string): string {
    const statusMap: Record<string, string> = {
      pending: '待機中',
      accepted: '受諾',
      declined: 'お断り',
      expired: '期限切れ',
    };
    return statusMap[status] || status;
  }
}

export default new HostAlternateButtonAction();
