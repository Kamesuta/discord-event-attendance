import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageActionRowComponentBuilder,
  UserSelectMenuBuilder,
  UserSelectMenuInteraction,
} from 'discord.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import { logger } from '../../../utils/log.js';
import eventHostPlanCommand, {
  PlanSetupData,
} from '../../event_host_command/EventHostPlanCommand.js';
import { prisma } from '../../../utils/prisma.js';
import { Event, User } from '@prisma/client';

/**
 * 主催者お伺いワークフロー計画作成 - 候補者ポジション別ユーザーセレクトアクション
 */
class PlanCandidatePositionUserSelectAction extends MessageComponentActionInteraction<ComponentType.UserSelect> {
  /**
   * ユーザーセレクトメニューを作成
   * @param eventId イベントID
   * @param position ポジション（1番手、2番手、3番手）
   * @returns 作成したビルダー
   */
  override create(eventId: number, position: number): UserSelectMenuBuilder {
    // カスタムIDを生成
    const customId = this.createCustomId({
      evt: eventId.toString(),
      pos: position.toString(),
    });

    // ユーザーセレクトメニューを作成
    return new UserSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(`${position}番手候補者を選択（空欄可）`)
      .setMinValues(0)
      .setMaxValues(1);
  }

  /**
   * ユーザー選択処理
   * @param interaction インタラクション
   * @param params URLパラメータ
   * @returns Promise<void>
   */
  async onCommand(
    interaction: UserSelectMenuInteraction,
    params: URLSearchParams,
  ): Promise<void> {
    const eventId = params.get('evt');
    const position = params.get('pos');

    if (!eventId || !position) {
      await interaction.reply({
        content: 'パラメータが見つかりませんでした。',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferUpdate();

    try {
      const eventIdNum = parseInt(eventId);
      const positionNum = parseInt(position);

      if (isNaN(eventIdNum) || isNaN(positionNum)) {
        await interaction.followUp({
          content: 'パラメータが無効です。',
          ephemeral: true,
        });
        return;
      }

      // 設定データを取得
      const key = new URLSearchParams({
        user: interaction.user.id,
        event: eventIdNum.toString(),
      }).toString();

      const setupData = await eventHostPlanCommand.getSetupData(
        key,
        eventIdNum,
      );

      // 選択されたユーザーを取得
      let selectedUser = null;
      if (interaction.values.length > 0) {
        const selectedUserId = interaction.values[0];
        selectedUser = await prisma.user.findFirst({
          where: {
            userId: selectedUserId,
          },
        });
      }

      // 現在の候補者配列をコピー
      const currentCandidates: (User | null)[] = [...setupData.candidates];

      // 指定されたポジションの候補者を更新
      if (selectedUser) {
        // ポジションに候補者を設定（配列を拡張してインデックスを確保）
        while (currentCandidates.length < positionNum) {
          currentCandidates.push(null); // 一時的にnullで埋める
        }
        currentCandidates[positionNum - 1] = selectedUser;
      } else {
        // 候補者を削除
        if (currentCandidates.length >= positionNum) {
          currentCandidates[positionNum - 1] = null;
        }
      }

      // nullを除去して詰める
      const filteredCandidates = currentCandidates.filter(
        (candidate): candidate is User => candidate !== null,
      );

      // 設定データを更新
      eventHostPlanCommand.setSetupData(setupData, {
        candidates: filteredCandidates,
      });

      // イベント情報を取得
      const event = await prisma.event.findUnique({
        where: { id: eventIdNum },
      });

      if (!event) {
        await interaction.followUp({
          content: 'イベントが見つかりませんでした。',
          ephemeral: true,
        });
        return;
      }

      // 設定パネルを更新
      await this._updateSetupPanel(interaction, event, setupData);
    } catch (error) {
      logger.error('候補者選択処理でエラー:', error);
      await interaction.followUp({
        content:
          'エラーが発生しました。しばらく時間をおいて再試行してください。',
        ephemeral: true,
      });
    }
  }

  /**
   * 設定パネルを更新
   * @param interaction インタラクション
   * @param event イベント
   * @param setupData 設定データ
   * @returns Promise<void>
   */
  private async _updateSetupPanel(
    interaction: UserSelectMenuInteraction,
    event: Event,
    setupData: PlanSetupData,
  ): Promise<void> {
    try {
      const embed = eventHostPlanCommand.makeSetupEmbed(event, setupData);
      const components = this._createSetupPanelComponents(event.id, setupData);

      await interaction.editReply({
        embeds: [embed],
        components,
      });
    } catch (error) {
      logger.error('設定パネル更新でエラー:', error);
      // フォールバック: 基本的な更新のみ
      const embed = eventHostPlanCommand.makeSetupEmbed(event, setupData);
      await interaction.editReply({
        embeds: [embed],
      });
    }
  }

  /**
   * 設定パネルのコンポーネントを作成
   * @param eventId イベントID
   * @param setupData 設定データ
   * @returns Promise<ActionRowBuilder[]>
   */
  private _createSetupPanelComponents(
    eventId: number,
    setupData: PlanSetupData,
  ): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
    // 3つの候補者選択フィールドを作成
    const candidateRows: import('discord.js').ActionRowBuilder<UserSelectMenuBuilder>[] =
      [];
    for (let i = 1; i <= 3; i++) {
      const userSelect = this.create(eventId, i);
      const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        userSelect,
      );
      candidateRows.push(row);
    }

    // 並行公募・確定・キャンセルボタンを作成
    const controlButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`hpat_${eventId}`) // 並行公募切り替え
        .setLabel(`並行公募: ${setupData.allowPublicApply ? 'はい' : 'いいえ'}`)
        .setStyle(
          setupData.allowPublicApply
            ? ButtonStyle.Success
            : ButtonStyle.Secondary,
        ),
      new ButtonBuilder()
        .setCustomId(`hpme_${eventId}`) // 依頼メッセージ編集
        .setLabel('依頼メッセージ編集')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`hpco_${eventId}`) // 確定
        .setLabel('確定')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`hpca_${eventId}`) // キャンセル
        .setLabel('キャンセル')
        .setStyle(ButtonStyle.Danger),
    );

    return [...candidateRows, controlButtons];
  }
}

export default new PlanCandidatePositionUserSelectAction(
  'hpcp',
  ComponentType.UserSelect,
);
