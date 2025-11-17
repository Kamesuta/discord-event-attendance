import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { eventManager } from '@/domain/services/EventManager';
import { MessageComponentActionInteraction } from '@/commands/base/actionBase';
import { reviewFilterMarkModalAction } from './ReviewFilterMarkModalAction.js';
import { Event } from '@prisma/client';

class ReviewFilterMarkButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
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
      .setLabel('◯分以上を全員追加')
      .setStyle(ButtonStyle.Success)
      .setEmoji('📥');
  }

  /** @inheritdoc */
  async onCommand(
    interaction: ButtonInteraction,
    params: URLSearchParams,
  ): Promise<void> {
    const eventId = params.get('event');
    if (!eventId) return; // 必要なパラメータがない場合は旧形式の可能性があるため無視

    // モーダルのため、deferできない
    // await interaction.deferReply({ ephemeral: true });
    const event = await eventManager.getEventFromId(
      eventId ? parseInt(eventId) : undefined,
    );
    if (!event) {
      await interaction.reply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // モーダルを表示
    await interaction.showModal(reviewFilterMarkModalAction.create(event));
  }
}

/**
 * ReviewFilterMarkButtonActionのインスタンス
 */
export const reviewFilterMarkButtonAction = new ReviewFilterMarkButtonAction(
  'rfadd',
  ComponentType.Button,
);
