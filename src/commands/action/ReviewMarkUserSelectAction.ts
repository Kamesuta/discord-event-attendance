import {
  ComponentType,
  RepliableInteraction,
  UserSelectMenuBuilder,
  UserSelectMenuInteraction,
} from 'discord.js';
import eventManager from '../../event/EventManager.js';
import { MessageComponentActionInteraction } from '../base/action_base.js';
import { Event } from '@prisma/client';
import setShowStats from '../../event/setShowStats.js';
import eventReviewCommand from '../event_command/EventReviewCommand.js';

class ReviewMarkUserSelectAction extends MessageComponentActionInteraction<ComponentType.UserSelect> {
  /** UUID -> ユーザーIDのリスト */
  private _userIds: Record<string, string[]> = {};

  /**
   * 出席/欠席ユーザー選択メニューを作成
   * @param event イベント
   * @param interaction インタラクション (ID取得用)
   * @param selectedUserIds 選択済みのユーザーID
   * @returns 作成したビルダー
   */
  override create(
    event: Event,
    interaction: RepliableInteraction,
    selectedUserIds: string[],
  ): UserSelectMenuBuilder {
    // 選択済みのユーザーIDを保存
    this._userIds[interaction.id] = selectedUserIds;

    // カスタムIDを生成
    const customId = this.createCustomId({
      event: `${event.id}`,
      uuid: interaction.id,
    });

    // ダイアログを作成
    return (
      new UserSelectMenuBuilder()
        .setCustomId(customId)
        .setMinValues(0)
        .setMaxValues(25)
        // プレースホルダーを設定
        .setPlaceholder('参加した人を削除')
        // まだステータスが未設定のユーザーをデフォルトで選択
        .setDefaultUsers(selectedUserIds.slice(0, 25))
    );
  }

  /** @inheritdoc */
  async onCommand(
    interaction: UserSelectMenuInteraction,
    params: URLSearchParams,
  ): Promise<void> {
    const eventId = params.get('event');
    const uuid = params.get('uuid');
    if (!eventId || !uuid) return; // 必要なパラメータがない場合は旧形式の可能性があるため無視

    await interaction.deferReply({ ephemeral: true });

    // 選択済みのユーザーIDを取得
    const selectedUserIds = this._userIds[uuid];
    if (!selectedUserIds) {
      await interaction.editReply({
        content:
          'このreviewメニューは古いため使用できません。\nもう一度`/event review`からやりなおしてください。',
      });
      return;
    }
    // メニューは使い捨て。自動更新されるため問題ない想定
    delete this._userIds[uuid];

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

    // 削除したユーザーを抽出
    const removeUserIds = selectedUserIds.filter(
      (userId) => !interaction.values.includes(userId),
    );
    // 逆に追加したユーザーを抽出
    const addUserIds = interaction.values.filter(
      (userId) => !selectedUserIds.includes(userId),
    );
    // 出席としてマークするユーザー
    const markUserIds = [...removeUserIds, ...addUserIds];

    // 出席としてマーク
    await setShowStats(event, markUserIds, true);
    await interaction.editReply({
      content: `${markUserIds
        .map((userId) => `<@${userId}>`)
        .join('')} を☑️出席としてマークしました`,
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

export default new ReviewMarkUserSelectAction('mark', ComponentType.UserSelect);
