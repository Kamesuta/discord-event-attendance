import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventHostCommand from './EventHostCommand.js';
import { hostWorkflowManager } from '../../event/HostWorkflowManager.js';
import { hostRequestManager } from '../../event/HostRequestManager.js';
import { logger } from '../../utils/log.js';

/**
 * 主催者お伺いワークフローの進捗確認コマンド
 * /event_host status
 */
class EventHostStatusCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('status')
    .setDescription('主催者お伺いワークフローの進捗状況を確認します')
    .addIntegerOption((option) =>
      option
        .setName('event_id')
        .setDescription('特定のイベントの進捗を確認（省略時は全体の状況）')
        .setRequired(false),
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
    const show = interaction.options.getBoolean('show') ?? false;
    await interaction.deferReply({ ephemeral: !show });

    try {
      const eventId = interaction.options.getInteger('event_id');

      if (eventId) {
        // 特定イベントの詳細進捗を表示
        await this._showEventStatus(interaction, eventId);
      } else {
        // 全体の進捗状況を表示
        await this._showOverallStatus(interaction);
      }
    } catch (error) {
      logger.error('主催者お伺いワークフロー進捗確認でエラー:', error);
      await interaction.editReply({
        content:
          'エラーが発生しました。しばらく時間をおいて再試行してください。',
      });
    }
  }

  /**
   * 特定イベントの詳細進捗を表示
   * @param interaction インタラクション
   * @param eventId イベントID
   */
  private async _showEventStatus(
    interaction: ChatInputCommandInteraction<'cached'>,
    eventId: number,
  ): Promise<void> {
    const progress = await hostWorkflowManager.getWorkflowProgress(eventId);

    if (!progress.workflow) {
      await interaction.editReply({
        content: `イベントID ${eventId} のワークフローが見つかりませんでした。`,
      });
      return;
    }

    // ワークフローの状態を推定
    const workflowStatus = this._inferWorkflowStatus(progress.requests);

    const embed = new EmbedBuilder()
      .setTitle(`📊 ワークフロー進捗詳細`)
      .setDescription(`イベント: **${progress.workflow.event.name}**`)
      .setColor(this._getStatusColor(workflowStatus))
      .setTimestamp();

    // 基本情報
    embed.addFields(
      {
        name: 'ステータス',
        value: this._getStatusText(workflowStatus),
        inline: true,
      },
      {
        name: '進捗',
        value: `${progress.currentPosition}/${progress.totalCandidates}`,
        inline: true,
      },
      {
        name: '公募併用',
        value: progress.workflow.allowPublicApply ? 'はい' : 'いいえ',
        inline: true,
      },
    );

    // 現在のお伺い状況
    if (progress.currentRequest) {
      const remainingTime = hostRequestManager.getRemainingTimeMinutes(
        progress.currentRequest,
      );
      const timeText =
        remainingTime > 0
          ? `残り ${Math.floor(remainingTime / 60)}時間${remainingTime % 60}分`
          : '期限切れ';

      embed.addFields({
        name: '現在お伺い中',
        value: `<@${progress.currentRequest.user.userId}> (${timeText})`,
        inline: false,
      });
    }

    // 候補者一覧
    if (progress.requests.length > 0) {
      const candidateList = progress.requests
        .map((request, _index) => {
          const status = this._getRequestStatusEmoji(request.status);
          const current =
            request.priority === progress.currentPosition ? '👉 ' : '';
          return `${current}${request.priority}. ${status} <@${request.user.userId}>`;
        })
        .join('\n');

      embed.addFields({
        name: '候補者一覧',
        value: candidateList,
        inline: false,
      });
    }

    // 管理ボタン
    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`host_status_refresh_${eventId}`)
        .setLabel('更新')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄'),
      new ButtonBuilder()
        .setCustomId(`host_status_cancel_${eventId}`)
        .setLabel('ワークフロー中止')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌'),
    );

    await interaction.editReply({
      embeds: [embed],
      components: [buttons],
    });
  }

  /**
   * 全体の進捗状況を表示
   * @param interaction インタラクション
   */
  private async _showOverallStatus(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const activeWorkflows = await hostWorkflowManager.getActiveWorkflows();

    const embed = new EmbedBuilder()
      .setTitle('📈 主催者お伺いワークフロー全体状況')
      .setColor(0x3498db)
      .setTimestamp();

    if (activeWorkflows.length === 0) {
      embed.setDescription('現在進行中のワークフローはありません。');
    } else {
      embed.setDescription(
        `現在 ${activeWorkflows.length} 件のワークフローが進行中です。`,
      );

      // アクティブなワークフロー一覧
      const workflowList = await Promise.all(
        activeWorkflows.map(async (workflow) => {
          const progress = await hostWorkflowManager.getWorkflowProgress(
            workflow.event.id,
          );
          const workflowStatus = this._inferWorkflowStatus(progress.requests);
          const statusText = this._getStatusText(workflowStatus);

          return (
            `**${workflow.event.name}** (ID: ${workflow.event.id})\n` +
            `└ ${statusText} - ${progress.currentPosition}/${progress.totalCandidates}人`
          );
        }),
      );

      embed.addFields({
        name: '進行中のワークフロー',
        value: workflowList.join('\n\n'),
        inline: false,
      });
    }

    // 期限切れのお伺いをチェック
    const expiredCount = await hostRequestManager.expireOverdueRequests();
    if (expiredCount > 0) {
      embed.addFields({
        name: '⚠️ 自動処理',
        value: `期限切れのお伺い ${expiredCount} 件を自動で期限切れに変更しました。`,
        inline: false,
      });
    }

    // 管理ボタン
    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('host_status_refresh_all')
        .setLabel('更新')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄'),
      new ButtonBuilder()
        .setCustomId('host_status_plan_new')
        .setLabel('新しい計画を作成')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('➕'),
    );

    await interaction.editReply({
      embeds: [embed],
      components: [buttons],
    });
  }

  /**
   * リクエストからワークフローの状態を推定
   * @param requests お伺いリクエスト一覧
   * @returns ワークフロー状態
   */
  private _inferWorkflowStatus(requests: Array<{ status: string }>): string {
    if (!requests || requests.length === 0) {
      return 'planning';
    }

    const hasAccepted = requests.some((r) => r.status === 'ACCEPTED');
    if (hasAccepted) {
      return 'completed';
    }

    const hasPending = requests.some((r) => r.status === 'PENDING');
    if (hasPending) {
      return 'requesting';
    }

    const hasWaiting = requests.some((r) => r.status === 'WAITING');
    if (hasWaiting) {
      return 'planning';
    }

    // 全てDECLINEDの場合
    return 'cancelled';
  }

  /**
   * ワークフロー状態に応じた色を取得
   * @param status ワークフロー状態
   * @returns 色コード
   */
  private _getStatusColor(status: string): number {
    switch (status) {
      case 'planning':
        return 0xf39c12; // オレンジ
      case 'requesting':
        return 0x3498db; // 青
      case 'completed':
        return 0x27ae60; // 緑
      case 'cancelled':
        return 0xe74c3c; // 赤
      default:
        return 0x95a5a6; // グレー
    }
  }

  /**
   * ワークフロー状態のテキストを取得
   * @param status ワークフロー状態
   * @returns 状態テキスト
   */
  private _getStatusText(status: string): string {
    switch (status) {
      case 'planning':
        return '📋 計画中';
      case 'requesting':
        return '📤 お伺い中';
      case 'completed':
        return '✅ 完了';
      case 'cancelled':
        return '❌ 中止';
      default:
        return '❓ 不明';
    }
  }

  /**
   * お伺いリクエスト状態の絵文字を取得
   * @param status お伺いリクエスト状態
   * @returns 絵文字
   */
  private _getRequestStatusEmoji(status: string): string {
    switch (status) {
      case 'WAITING':
        return '⏳';
      case 'PENDING':
        return '📬';
      case 'ACCEPTED':
        return '✅';
      case 'DECLINED':
        return '❌';
      default:
        return '❓';
    }
  }

  /**
   * ワークフロー進捗の詳細表示
   * @param _interaction インタラクション
   * @param _eventId イベントID
   * @returns Promise<void>
   */
  private async _showWorkflowDetails(
    _interaction: ChatInputCommandInteraction<'cached'>,
    _eventId: number,
  ): Promise<void> {
    // Implementation of _showWorkflowDetails method
  }
}

export default new EventHostStatusCommand(eventHostCommand);
