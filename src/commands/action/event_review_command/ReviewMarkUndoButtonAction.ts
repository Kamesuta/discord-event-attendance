import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import eventManager from '../../../event/EventManager.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import { Event } from '@prisma/client';
import eventReviewCommand from '../../event_command/EventReviewCommand.js';
import { prisma } from '../../../utils/prisma.js';

class ReviewMarkUndoButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  /**
   * 出席/欠席ユーザー選択メニューを作成
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
      .setLabel('戻す')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('↩️');
  }

  /** @inheritdoc */
  async onCommand(
    interaction: ButtonInteraction,
    params: URLSearchParams,
  ): Promise<void> {
    const eventId = params.get('event');
    if (!eventId) return; // 必要なパラメータがない場合は旧形式の可能性があるため無視

    await interaction.deferReply({ ephemeral: true });

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

    // インタラクションが保存されている場合は更新
    const editData = eventReviewCommand.editDataHolder.get(interaction, event);

    // 一つ前の状態を取得
    const previous = editData.history.pop();
    if (!previous) {
      await interaction.editReply({
        content: 'これ以上戻せません',
      });
      return;
    }

    // showでもhideでもない人を取得
    const otherUserIds = userIds.filter(
      (userId) =>
        !previous.show.includes(userId) && !previous.hide.includes(userId),
    );

    // マークをクリア
    await eventReviewCommand.setShowStats(event, otherUserIds, null);
    await eventReviewCommand.setShowStats(event, previous.show, true);
    await eventReviewCommand.setShowStats(event, previous.hide, false);
    await interaction.editReply({
      content: `一つ前へ戻しました`,
    });

    // イベントの出欠状況を表示するメッセージを作成
    const messageOption = await eventReviewCommand.createReviewEventMessage(
      interaction,
      event,
    );
    // 編集 または送信
    await editData.interaction.editReply(interaction, messageOption);
  }
}

export default new ReviewMarkUndoButtonAction('rundo', ComponentType.Button);
