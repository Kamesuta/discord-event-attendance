import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} from 'discord.js';
import { eventManager } from '@/domain/services/EventManager';
import { MessageComponentActionInteraction } from '@/commands/base/actionBase';
import { Event } from '@/generated/prisma/client';
import { eventReviewCommand } from '@/commands/eventCommand/EventReviewCommand';
import { prisma } from '@/utils/prisma';

class ReviewMarkClearButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  /**
   * ボタンを作成
   * @param event イベント
   * @returns 作成したビルダー
   */
  override create(event: Event): ButtonBuilder {
    // カスタムIDを生成
    const customId = this.createCustomId({
      event: `${event.id}`,
    });

    // ダイアログを作成
    return new ButtonBuilder()
      .setCustomId(customId)
      .setLabel('出席をクリア')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️');
  }

  /** @inheritdoc */
  async onCommand(
    interaction: ButtonInteraction,
    params: URLSearchParams,
  ): Promise<void> {
    const eventId = params.get('event');
    if (!eventId) return; // 必要なパラメータがない場合は旧形式の可能性があるため無視

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // イベントを取得
    const event = await eventManager.getEventFromId(
      eventId ? parseInt(eventId) : undefined,
    );
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // すべてのユーザーを取得
    const userIds = (
      await prisma.userStat.findMany({
        where: {
          eventId: event.id,
        },
      })
    ).map((stat) => stat.userId);

    // マークをクリア
    await eventReviewCommand.addToHistory(interaction, event);
    await eventReviewCommand.setShowStats(event, userIds, null);
    await interaction.editReply({
      content: `マークをクリアしました`,
    });

    // インタラクションが保存されている場合は更新
    const editData = eventReviewCommand.editDataHolder.get(interaction, event);
    // イベントの出欠状況を表示するメッセージを作成
    const messageOption = await eventReviewCommand.createReviewEventMessage(
      interaction,
      event,
    );
    // 編集 または送信
    await editData.interaction.editReply(interaction, messageOption);
  }
}

/**
 * ReviewMarkClearButtonActionのインスタンス
 */
export const reviewMarkClearButtonAction = new ReviewMarkClearButtonAction(
  'rclr',
  ComponentType.Button,
);
