import {
  ComponentType,
  Message,
  RepliableInteraction,
  UserSelectMenuBuilder,
  UserSelectMenuInteraction,
} from 'discord.js';
import eventManager from '../../event/EventManager.js';
import { MessageComponentActionInteraction } from '../base/action_base.js';
import { Event } from '@prisma/client';
import setShowStats from '../../event/setShowStats.js';
import reviewEvent from '../../event/reviewEvent.js';

class ReviewMarkUserSelectAction extends MessageComponentActionInteraction<ComponentType.UserSelect> {
  private _msgToInteraction: Record<string, RepliableInteraction> = {};

  /**
   * 出席/欠席ユーザー選択メニューを作成
   * @param event イベント
   * @param selectedUserIds 選択済みのユーザーID
   * @param action 出席 or 欠席
   * @returns 作成したビルダー
   */
  override create(
    event: Event,
    selectedUserIds: string[],
    action: 'show' | 'hide',
  ): UserSelectMenuBuilder {
    // カスタムIDを生成
    const customId = this.createCustomId({
      event: `${event.id}`,
      action,
    });

    // ダイアログを作成
    return (
      new UserSelectMenuBuilder()
        .setCustomId(customId)
        .setMinValues(0)
        .setMaxValues(25)
        // プレースホルダーを設定
        .setPlaceholder(
          action === 'show' ? '参加した人を選択' : '参加していない人を選択',
        )
        // まだステータスが未設定のユーザーをデフォルトで選択
        .setDefaultUsers(selectedUserIds.slice(0, 25))
    );
  }

  /**
   * メッセージにインタラクションを関連付け
   * @param message メッセージ
   * @param interaction インタラクション
   */
  registerInteraction(
    message: Message,
    interaction: RepliableInteraction,
  ): void {
    this._msgToInteraction[message.id] = interaction;
  }

  /** @inheritdoc */
  async onCommand(
    interaction: UserSelectMenuInteraction,
    params: URLSearchParams,
  ): Promise<void> {
    const eventId = params.get('event');
    const action = params.get('action');
    if (!eventId || !action) return; // 必要なパラメータがない場合は旧形式の可能性があるため無視

    await interaction.deferReply({ ephemeral: true });
    const event = await eventManager.getEventFromId(
      eventId ? parseInt(eventId) : undefined,
    );
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    switch (action) {
      case 'show':
        // 出席としてマーク
        await setShowStats(event, interaction.values, true);
        await interaction.editReply({
          content: `${interaction.values
            .map((userId) => `<@${userId}>`)
            .join('')} を☑️出席としてマークしました`,
        });
        break;
      case 'hide':
        // 欠席としてマーク
        await setShowStats(event, interaction.values, false);
        await interaction.editReply({
          content: `${interaction.values
            .map((userId) => `<@${userId}>`)
            .join('')} を❌欠席としてマークしました`,
        });
        break;
    }

    // インタラクションが保存されている場合は更新
    const msgInteraction = this._msgToInteraction[interaction.message.id];
    if (msgInteraction) {
      await reviewEvent(msgInteraction, event);
    }
  }
}

export default new ReviewMarkUserSelectAction('mark', ComponentType.UserSelect);
