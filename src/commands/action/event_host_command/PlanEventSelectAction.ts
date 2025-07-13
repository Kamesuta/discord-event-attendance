import {
  ComponentType,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  ActionRowBuilder,
  MessageActionRowComponentBuilder,
} from 'discord.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import { Event } from '@prisma/client';
import { logger } from '../../../utils/log.js';
import { hostWorkflowManager } from '../../../event/HostWorkflowManager.js';
import { prisma } from '../../../utils/prisma.js';
import eventHostPlanCommand, {
  PlanSetupData,
} from '../../event_host_command/EventHostPlanCommand.js';

/**
 * 主催者お伺いワークフロー計画作成 - イベント選択アクション
 */
class PlanEventSelectAction extends MessageComponentActionInteraction<ComponentType.StringSelect> {
  /**
   * イベント選択メニューを作成
   * @param events イベントリスト
   * @returns 作成したビルダー
   */
  override create(events: Event[]): StringSelectMenuBuilder {
    // カスタムIDを生成
    const customId = this.createCustomId();

    // セレクトメニューを作成
    const eventSelect = new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('計画を作成するイベントを選択...')
      .setMinValues(1)
      .setMaxValues(Math.min(events.length, 10)); // 最大10個まで

    // オプションを追加
    eventSelect.addOptions(
      events.slice(0, 25).map((event) => {
        // Discordの制限で最大25個
        const dateStr = event.scheduleTime
          ? new Date(event.scheduleTime).toLocaleDateString('ja-JP', {
              month: '2-digit',
              day: '2-digit',
              weekday: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '未定';

        return {
          label: `${dateStr} ${event.name} (ID: ${event.id})`,
          value: event.id.toString(),
        };
      }),
    );

    return eventSelect;
  }

  /**
   * イベント選択処理
   * @param interaction インタラクション
   * @param _params URLパラメータ
   * @returns Promise<void>
   */
  async onCommand(
    interaction: StringSelectMenuInteraction,
    _params: URLSearchParams,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const selectedEventIds = interaction.values.map((id) => parseInt(id));

      // 1つのイベントが選択された場合は設定パネルを表示
      if (selectedEventIds.length === 1) {
        await this._showSetupPanel(interaction, selectedEventIds[0]);
        return;
      }

      // 複数のイベントが選択された場合はまとめて処理
      await this._processBatchEvents(interaction, selectedEventIds);
    } catch (error) {
      logger.error('イベント選択処理でエラー:', error);
      await interaction.editReply({
        content:
          'エラーが発生しました。しばらく時間をおいて再試行してください。',
      });
    }
  }

  /**
   * 設定パネルを表示
   * @param interaction インタラクション
   * @param eventId イベントID
   * @returns Promise<void>
   */
  private async _showSetupPanel(
    interaction: StringSelectMenuInteraction,
    eventId: number,
  ): Promise<void> {
    // イベントを取得
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした。',
      });
      return;
    }

    // 既存のワークフローをチェック
    const existingWorkflow = await hostWorkflowManager.getWorkflow(eventId);
    if (existingWorkflow) {
      await interaction.editReply({
        content: `イベント「${event.name}」は既にワークフローが作成されています。`,
      });
      return;
    }

    // 設定データを取得・初期化
    const setupData = await eventHostPlanCommand.getSetupData(
      interaction,
      eventId,
    );

    // 設定パネルを表示
    await this._updateSetupPanel(interaction, event, setupData);
  }

  /**
   * 設定パネルを更新
   * @param interaction インタラクション
   * @param event イベント
   * @param setupData 設定データ
   * @returns Promise<void>
   */
  private async _updateSetupPanel(
    interaction: StringSelectMenuInteraction,
    event: Event,
    setupData: PlanSetupData,
  ): Promise<void> {
    const embed = eventHostPlanCommand.makeSetupEmbed(event, setupData);
    const components = this._createSetupPanelComponents(event.id, setupData);

    const message = {
      embeds: [embed],
      components,
    };

    await interaction.editReply(message);
  }

  /**
   * 設定パネルのコンポーネントを作成
   * @param eventId イベントID
   * @param setupData 設定データ
   * @returns ActionRowBuilder[]
   */
  private _createSetupPanelComponents(
    eventId: number,
    setupData: PlanSetupData,
  ): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
    return eventHostPlanCommand.createSetupPanelComponents(eventId, setupData);
  }

  /**
   * 複数イベントの一括処理
   * @param interaction インタラクション
   * @param eventIds イベントID一覧
   * @returns Promise<void>
   */
  private async _processBatchEvents(
    interaction: StringSelectMenuInteraction,
    eventIds: number[],
  ): Promise<void> {
    // 選択されたイベントに対してワークフローを作成
    const results = await Promise.allSettled(
      eventIds.map(async (eventId) => {
        const existingWorkflow = await hostWorkflowManager.getWorkflow(eventId);
        if (existingWorkflow) {
          return { eventId, status: 'exists' };
        }

        // ワークフロー作成（具体的な実装は後で追加）
        return { eventId, status: 'created' };
      }),
    );

    // 結果を集計
    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const alreadyExists = results.filter(
      (r) =>
        r.status === 'fulfilled' &&
        r.value &&
        typeof r.value === 'object' &&
        'status' in r.value &&
        r.value.status === 'exists',
    ).length;

    let message = `${successful}件のイベントに対して計画を作成しました。`;
    if (alreadyExists > 0) {
      message += `\n${alreadyExists}件のイベントは既に計画が存在しています。`;
    }

    await interaction.editReply({
      content: message,
    });
  }
}

export default new PlanEventSelectAction('hpes', ComponentType.StringSelect);
