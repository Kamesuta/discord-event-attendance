import {
  ButtonInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
} from 'discord.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import { hostRequestManager, HostRequestWithRelations } from '../../../event/HostRequestManager.js';
import { hostWorkflowManager } from '../../../event/HostWorkflowManager.js';
import { config } from '../../../utils/config.js';
import { client } from '../../../utils/client.js';
import { logger } from '../../../utils/log.js';

/**
 * 主催断るボタンアクション
 * host_decline_{hostRequestId}
 */
export class HostDeclineButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  customIdPattern = /^host_decline_(\d+)$/;

  /**
   * コンストラクタ
   */
  constructor() {
    super('host_decline', ComponentType.Button);
  }

  /**
   * ビルダーの作成
   * @param hostRequestId ホストリクエストID
   * @returns ButtonBuilder
   */
  create(hostRequestId: number): ButtonBuilder {
    return new ButtonBuilder()
      .setCustomId(`host_decline_${hostRequestId}`)
      .setLabel('お断りする')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌');
  }

  /**
   * ボタン実行
   * @param interaction インタラクション
   * @param _params URLSearchParams（未使用）
   * @returns Promise<void>
   */
  async onCommand(interaction: ButtonInteraction<'cached'>, _params: URLSearchParams): Promise<void> {
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
      if (hostRequest.status !== 'pending') {
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

      // お伺いリクエストを断る状態に更新
      await hostRequestManager.updateRequestStatus(hostRequestId, 'declined');

      // 元のDMメッセージを更新
      await this._updateOriginalDMMessage(interaction, hostRequest);

      // 管理チャンネルに通知
      await this._notifyManagementChannel(hostRequest);

      // 次の候補者に進む
      const nextCandidate = await hostWorkflowManager.proceedToNextCandidate(hostRequest.eventId);
      
      let nextCandidateMessage = '';
      if (nextCandidate) {
        nextCandidateMessage = '\n\n次の候補者に自動で依頼を送信しました。';
        // 次の候補者にDMを送信（EventHostStartCommand.tsのロジックを再利用）
        await this._sendNextHostRequestDM(nextCandidate.id);
      } else {
        nextCandidateMessage = '\n\n全ての候補者への依頼が完了しました。管理者が別途対応いたします。';
      }

      // ユーザーに確認メッセージ
      const embed = new EmbedBuilder()
        .setTitle('❌ お断り確認')
        .setDescription(
          `**${hostRequest.event.name}** の主催依頼をお断りしました。\n\n` +
          'ご都合が悪い中、ご回答いただきありがとうございました。' + nextCandidateMessage
        )
        .setColor(0xff6b6b)
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed],
      });

      logger.info(
        `主催お断りが処理されました: User=${interaction.user.username}, Event=${hostRequest.event.name}`,
      );

    } catch (error) {
      logger.error('主催お断り処理でエラー:', error);
      await interaction.editReply({
        content: 'エラーが発生しました。管理者にお問い合わせください。',
      });
    }
  }

  /**
   * 元のDMメッセージを更新
   * @param interaction インタラクション
   * @param hostRequest お伺いリクエスト
   * @returns Promise<void>
   */
  private async _updateOriginalDMMessage(
    interaction: ButtonInteraction,
    hostRequest: HostRequestWithRelations,
  ): Promise<void> {
    try {
      const embed = new EmbedBuilder()
        .setTitle('🎯 イベント主催のお伺い')
        .setDescription(
          `**${hostRequest.event.name}** の主催をお願いできませんでしょうか？\n\n` +
          (hostRequest.message || 'よろしくお願いいたします。') + '\n\n' +
          `**❌ お断り済み** (${new Date().toLocaleString('ja-JP')})`
        )
        .addFields(
          {
            name: 'イベント情報',
            value: 
              `📅 **開催予定**: ${hostRequest.event.scheduleTime ? 
                new Date(hostRequest.event.scheduleTime).toLocaleString('ja-JP') : '未定'}\n` +
              `🆔 **イベントID**: ${hostRequest.event.id}`,
            inline: false,
          },
          {
            name: '状態',
            value: '❌ お断り済み',
            inline: true,
          },
          {
            name: '📋 優先順位',
            value: `第${hostRequest.priority}候補`,
            inline: true,
          },
        )
        .setColor(0xff6b6b)
        .setFooter({
          text: `HostRequest:${hostRequest.id} | Event:${hostRequest.eventId} | User:${hostRequest.userId}`,
        })
        .setTimestamp();

      // ボタンを無効化
      const disabledButtons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('disabled_accept')
            .setLabel('主催を受諾')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId('disabled_decline')
            .setLabel('お断り済み')
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
   * @returns Promise<void>
   */
  private async _notifyManagementChannel(hostRequest: HostRequestWithRelations): Promise<void> {
    try {
      const channel = client.channels.cache.get(config.host_request_channel_id);
      if (!channel?.isTextBased() || !('send' in channel)) {
        logger.error('管理チャンネルが見つからないかテキストチャンネルではありません');
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('❌ 主催お断り通知')
        .setDescription(
          `**${hostRequest.event.name}** の主催依頼がお断りされました。`
        )
        .addFields(
          {
            name: 'ユーザー',
            value: `${hostRequest.user.memberName || hostRequest.user.username}`,
            inline: true,
          },
          {
            name: 'イベント',
            value: `${hostRequest.event.name} (ID: ${hostRequest.event.id})`,
            inline: false,
          },
          {
            name: '優先順位',
            value: `第${hostRequest.priority}候補`,
            inline: true,
          },
        )
        .setColor(0xff6b6b)
        .setTimestamp();

      await channel.send({
        embeds: [embed],
      });

    } catch (error) {
      logger.error('管理チャンネルへの通知でエラー:', error);
    }
  }

  /**
   * 次の候補者にDMを送信
   * @param hostRequestId 次の候補者のお伺いリクエストID
   * @returns Promise<void>
   */
  private async _sendNextHostRequestDM(hostRequestId: number): Promise<void> {
    try {
      // EventHostStartCommand.tsのロジックと同様の処理
      const hostRequest = await hostRequestManager.getRequest(hostRequestId);
      if (!hostRequest) {
        logger.error(`次の候補者のお伺いリクエストが見つかりません: ID=${hostRequestId}`);
        return;
      }

      // DMユーザーを取得
      const dmUser = await client.users.fetch(hostRequest.user.id.toString());
      const dmChannel = await dmUser.createDM();

      // 期限の計算
      const remainingHours = Math.floor(
        (hostRequest.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)
      );

      // Embedを作成
      const embed = new EmbedBuilder()
        .setTitle('🎯 イベント主催のお伺い')
        .setDescription(
          `**${hostRequest.event.name}** の主催をお願いできませんでしょうか？\n\n` +
          (hostRequest.message || 'よろしくお願いいたします。')
        )
        .addFields(
          {
            name: 'イベント情報',
            value: 
              `📅 **開催予定**: ${hostRequest.event.scheduleTime ? 
                new Date(hostRequest.event.scheduleTime).toLocaleString('ja-JP') : '未定'}\n` +
              `🆔 **イベントID**: ${hostRequest.event.id}`,
            inline: false,
          },
          {
            name: '⏰ 回答期限',
            value: `約${remainingHours}時間後`,
            inline: true,
          },
          {
            name: '📋 優先順位',
            value: `第${hostRequest.priority}候補`,
            inline: true,
          },
        )
        .setColor(0x3498db)
        .setFooter({
          text: `HostRequest:${hostRequestId} | Event:${hostRequest.eventId} | User:${hostRequest.userId}`,
        })
        .setTimestamp();

      // ボタンを作成
      const buttons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`host_accept_${hostRequestId}`)
            .setLabel('主催を受諾')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
          new ButtonBuilder()
            .setCustomId(`host_decline_${hostRequestId}`)
            .setLabel('お断りする')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌'),
          new ButtonBuilder()
            .setCustomId(`host_alternate_${hostRequestId}`)
            .setLabel('別日を提案')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📅'),
        );

      // DMを送信
      const dmMessage = await dmChannel.send({
        embeds: [embed],
        components: [buttons],
      });

      // DMメッセージIDを保存
      await hostRequestManager.updateRequestStatus(
        hostRequestId,
        'pending',
        dmMessage.id,
      );

      logger.info(`次の候補者にDMを送信しました: User=${hostRequest.user.username}, Event=${hostRequest.event.name}`);

    } catch (error) {
      logger.error('次の候補者へのDM送信でエラー:', error);
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

export default new HostDeclineButtonAction();