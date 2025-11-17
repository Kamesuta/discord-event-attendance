import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { eventManager } from '@/domain/services/EventManager';
import { MessageComponentActionInteraction } from '@/commands/base/actionBase';
import { reviewPasteModalAction } from './ReviewPasteModalAction.js';
import { Event } from '@prisma/client';

/**
 * IDをペーストするボタンアクション
 */
class ReviewPasteButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
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

    // ボタンを作成
    return new ButtonBuilder()
      .setCustomId(customId)
      .setLabel('IDをペースト')
      .setStyle(ButtonStyle.Success)
      .setEmoji('📋');
  }

  /** @inheritdoc */
  async onCommand(
    interaction: ButtonInteraction,
    params: URLSearchParams,
  ): Promise<void> {
    const eventId = params.get('event');
    if (!eventId) return; // 必要なパラメータがない場合は旧形式の可能性があるため無視

    // イベントを取得
    const event = await eventManager.getEventFromId(
      eventId ? parseInt(eventId) : undefined,
    );
    if (!event) {
      await interaction.reply({
        content: 'イベントが見つかりませんでした',
        ephemeral: true,
      });
      return;
    }

    // モーダルを表示
    await interaction.showModal(reviewPasteModalAction.create(event));
  }
}

/**
 * ReviewPasteButtonActionのインスタンス
 */
export const reviewPasteButtonAction = new ReviewPasteButtonAction(
  'paste',
  ComponentType.Button,
);
