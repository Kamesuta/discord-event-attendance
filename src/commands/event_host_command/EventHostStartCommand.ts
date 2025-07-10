import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  User,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventHostCommand from './EventHostCommand.js';
import { hostWorkflowManager } from '../../event/HostWorkflowManager.js';
import { hostRequestManager } from '../../event/HostRequestManager.js';
import { client } from '../../utils/client.js';
import { logger } from '../../utils/log.js';

/**
 * 主催者お伺いワークフロー開始コマンド
 * /event_host start
 */
class EventHostStartCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('start')
    .setDescription('主催者お伺いワークフローを開始します')
    .addIntegerOption((option) =>
      option
        .setName('event_id')
        .setDescription('対象イベントID')
        .setRequired(true),
    )
    .addBooleanOption((option) =>
      option
        .setName('show')
        .setDescription(
          'コマンドの結果をチャットに表示しますか？（デフォルトは非公開）',
        )
        .setRequired(false),
    );

  /**
   * コマンド実行
   * @param interaction インタラクション
   * @returns Promise<void>
   */
  async onCommand(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const eventId = interaction.options.getInteger('event_id', true);
    const show = interaction.options.getBoolean('show') ?? true;

    await interaction.deferReply({ ephemeral: !show });

    try {
      // ワークフローの存在確認
      const workflow = await hostWorkflowManager.getWorkflow(eventId);
      if (!workflow) {
        await interaction.editReply({
          content:
            '指定されたイベントのワークフローが見つかりません。先に `/event_host plan` で計画を作成してください。',
        });
        return;
      }

      if (workflow.status !== 'planning') {
        await interaction.editReply({
          content: `ワークフローは既に${this._getStatusText(workflow.status)}状態です。`,
        });
        return;
      }

      // ワークフローを開始
      await hostWorkflowManager.startWorkflow(eventId);

      // 最初の候補者にDMを送信
      await this._sendFirstHostRequest(eventId);

      const embed = new EmbedBuilder()
        .setTitle('🚀 主催者お伺いワークフロー開始')
        .setDescription(
          `イベント「${workflow.event.name}」の主催者お伺いを開始しました。`,
        )
        .addFields(
          {
            name: '対象イベント',
            value: `${workflow.event.name} (ID: ${eventId})`,
            inline: false,
          },
          {
            name: '状態',
            value: '📞 候補者への依頼中',
            inline: true,
          },
          {
            name: '進捗確認',
            value: '`/event_host status` で進捗を確認できます',
            inline: false,
          },
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      logger.error('主催者お伺いワークフロー開始でエラー:', error);
      await interaction.editReply({
        content:
          'エラーが発生しました。しばらく時間をおいて再試行してください。',
      });
    }
  }

  /**
   * 最初の候補者にDMを送信
   * @param eventId イベントID
   * @returns Promise<void>
   */
  private async _sendFirstHostRequest(eventId: number): Promise<void> {
    try {
      // 最初の優先度のリクエストを取得
      const requests = await hostRequestManager.getRequestsByEvent(
        eventId,
        'pending',
      );
      const firstRequest = requests.find((req) => req.priority === 1);

      if (!firstRequest) {
        logger.error('最初の候補者が見つかりません', { eventId });
        return;
      }

      // DMを送信
      await this._sendHostRequestDM(firstRequest.id);
    } catch (error) {
      logger.error('最初の候補者へのDM送信でエラー:', error);
      throw error;
    }
  }

  /**
   * 主催者お伺いDMを送信
   * @param hostRequestId お伺いリクエストID
   * @returns Promise<void>
   */
  private async _sendHostRequestDM(hostRequestId: number): Promise<void> {
    try {
      const hostRequest = await hostRequestManager.getRequest(hostRequestId);
      if (!hostRequest) {
        throw new Error(
          `お伺いリクエストが見つかりません: ID=${hostRequestId}`,
        );
      }

      // DMチャンネルを取得
      let dmUser: User;
      try {
        dmUser = await client.users.fetch(hostRequest.user.id.toString());
      } catch (error) {
        logger.error('ユーザーの取得に失敗:', error);
        throw new Error('ユーザーが見つからないかDMを送信できません');
      }

      const dmChannel = await dmUser.createDM();

      // 期限の計算
      const remainingHours = Math.floor(
        (hostRequest.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60),
      );

      // Embedを作成
      const embed = new EmbedBuilder()
        .setTitle('🎯 イベント主催のお伺い')
        .setDescription(
          `**${hostRequest.event.name}** の主催をお願いできませんでしょうか？\n\n` +
            (hostRequest.message || 'よろしくお願いいたします。'),
        )
        .addFields(
          {
            name: 'イベント情報',
            value:
              `📅 **開催予定**: ${
                hostRequest.event.scheduleTime
                  ? new Date(hostRequest.event.scheduleTime).toLocaleString(
                      'ja-JP',
                    )
                  : '未定'
              }\n` + `🆔 **イベントID**: ${hostRequest.event.id}`,
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
      const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
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

      logger.info(
        `主催者お伺いDMを送信しました: User=${hostRequest.user.username}, Event=${hostRequest.event.name}`,
      );
    } catch (error) {
      logger.error('主催者お伺いDM送信でエラー:', error);
      throw error;
    }
  }

  /**
   * ワークフロー状態を日本語に変換
   * @param status ワークフロー状態
   * @returns 日本語状態
   */
  private _getStatusText(status: string): string {
    const statusMap: Record<string, string> = {
      planning: '計画中',
      requesting: '依頼中',
      completed: '完了',
      cancelled: 'キャンセル',
    };
    return statusMap[status] || status;
  }
}

/**
 * EventHostStartCommandのインスタンス
 */
export default new EventHostStartCommand(eventHostCommand);
