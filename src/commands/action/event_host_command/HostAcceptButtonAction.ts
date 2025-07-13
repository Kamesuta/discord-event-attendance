import {
  ButtonInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
} from 'discord.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import {
  hostRequestManager,
  HostRequestWithRelations,
} from '../../../event/HostRequestManager.js';
import { hostWorkflowManager } from '../../../event/HostWorkflowManager.js';
import { config } from '../../../utils/config.js';
import { client } from '../../../utils/client.js';
import { logger } from '../../../utils/log.js';

/**
 * 主催受諾ボタンアクション
 * host_accept_{hostRequestId}
 */
export class HostAcceptButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  customIdPattern = /^host_accept_(\d+)$/;

  /**
   * コンストラクタ
   */
  constructor() {
    super('host_accept', ComponentType.Button);
  }

  /**
   * ビルダーの作成
   * @param hostRequestId ホストリクエストID
   * @returns ButtonBuilder
   */
  create(hostRequestId: number): ButtonBuilder {
    return new ButtonBuilder()
      .setCustomId(`host_accept_${hostRequestId}`)
      .setLabel('主催を受諾')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅');
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
    await interaction.deferReply({ ephemeral: true });

    try {
      // カスタムIDからホストリクエストIDを抽出
      const match = this.customIdPattern.exec(interaction.customId);
      if (!match) {
        await interaction.editReply({
          content: 'エラー: 無効なボタンIDです。',
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

      // 既に回答済みかチェック
      if (hostRequest.status !== 'PENDING') {
        await interaction.editReply({
          content: `この依頼は既に${this._getStatusText(hostRequest.status)}済みです。`,
        });
        return;
      }

      // 期限切れチェック
      if (hostRequestManager.isExpired(hostRequest)) {
        await interaction.editReply({
          content: '申し訳ございませんが、回答期限が過ぎています。',
        });
        return;
      }

      // ユーザーIDチェック
      if (hostRequest.user.id !== parseInt(interaction.user.id)) {
        await interaction.editReply({
          content: 'エラー: このお伺いは他のユーザー宛てです。',
        });
        return;
      }

      // お伺いリクエストを受諾状態に更新
      await hostRequestManager.updateRequestStatus(hostRequestId, 'ACCEPTED');

      // ワークフローを完了
      await hostWorkflowManager.completeWorkflow(
        hostRequest.workflow.event.id,
        hostRequest.userId,
      );

      // 元のDMメッセージを更新
      await this._updateOriginalDMMessage(interaction, hostRequest, 'accepted');

      // 管理チャンネルに通知
      await this._notifyManagementChannel(hostRequest, 'accepted');

      // ユーザーに確認メッセージ
      const embed = new EmbedBuilder()
        .setTitle('✅ 主催受諾完了')
        .setDescription(
          `**${hostRequest.workflow.event.name}** の主催を受諾いたしました。\n\n` +
            '管理者に通知が送信されました。詳細は管理チャンネルでご確認ください。',
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed],
      });

      logger.info(
        `主催受諾が完了しました: User=${interaction.user.username}, Event=${hostRequest.workflow.event.name}`,
      );
    } catch (error) {
      logger.error('主催受諾処理でエラー:', error);
      await interaction.editReply({
        content: 'エラーが発生しました。管理者にお問い合わせください。',
      });
    }
  }

  /**
   * 元のDMメッセージを更新
   * @param interaction インタラクション
   * @param hostRequest お伺いリクエスト
   * @param _status 新しい状態（未使用）
   * @returns Promise<void>
   */
  private async _updateOriginalDMMessage(
    interaction: ButtonInteraction,
    hostRequest: HostRequestWithRelations,
    _status: string,
  ): Promise<void> {
    try {
      const embed = new EmbedBuilder()
        .setTitle('🎯 イベント主催のお伺い')
        .setDescription(
          `**${hostRequest.workflow.event.name}** の主催をお願いできませんでしょうか？\n\n` +
            (hostRequest.message || 'よろしくお願いいたします。') +
            '\n\n' +
            `**✅ 受諾済み** (${new Date().toLocaleString('ja-JP')})`,
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
            value: '✅ 受諾済み',
            inline: true,
          },
          {
            name: '📋 優先順位',
            value: `第${hostRequest.priority}候補`,
            inline: true,
          },
        )
        .setColor(0x00ff00)
        .setFooter({
          text: `HostRequest:${hostRequest.id} | Event:${hostRequest.workflow.event.id} | User:${hostRequest.userId}`,
        })
        .setTimestamp();

      // ボタンを無効化
      const disabledButtons =
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('disabled_accept')
            .setLabel('受諾済み')
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
            .setLabel('別日を提案')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📅')
            .setDisabled(true),
        );

      await interaction.message?.edit({
        embeds: [embed],
        components: [disabledButtons],
      });
    } catch (error) {
      logger.error('元DMメッセージの更新でエラー:', error);
    }
  }

  /**
   * 管理チャンネルに通知
   * @param hostRequest お伺いリクエスト
   * @param _status 状態（未使用）
   * @returns Promise<void>
   */
  private async _notifyManagementChannel(
    hostRequest: HostRequestWithRelations,
    _status: string,
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
        .setTitle('✅ 主催受諾通知')
        .setDescription(
          `${hostRequest.user.username || 'Unknown User'} さんが **${hostRequest.workflow.event.name}** の主催を受諾しました。`,
        )
        .addFields(
          {
            name: 'イベント情報',
            value: `📅 **開催予定**: ${
              hostRequest.workflow.event.scheduleTime
                ? new Date(
                    hostRequest.workflow.event.scheduleTime,
                  ).toLocaleString('ja-JP')
                : '未定'
            }`,
            inline: false,
          },
          {
            name: 'ユーザー情報',
            value: `👤 **ユーザー**: ${hostRequest.user.username || 'Unknown User'}\n📋 **優先順位**: 第${hostRequest.priority}候補`,
            inline: false,
          },
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await managementChannel.send({
        embeds: [embed],
      });
    } catch (error) {
      logger.error('管理チャンネル通知の送信でエラー:', error);
    }
  }

  /**
   * 状態テキストを取得
   * @param status 状態
   * @returns 状態テキスト
   */
  private _getStatusText(status: string): string {
    switch (status) {
      case 'WAITING':
        return '順番待ち';
      case 'PENDING':
        return '待機中';
      case 'ACCEPTED':
        return '受諾';
      case 'DECLINED':
        return '辞退';
      default:
        return '処理';
    }
  }
}

export default new HostAcceptButtonAction();
