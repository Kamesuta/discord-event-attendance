import {
  ComponentType,
  MessageFlags,
  RepliableInteraction,
  UserSelectMenuBuilder,
  UserSelectMenuInteraction,
} from 'discord.js';
import { eventManager } from '@/domain/services/EventManager';
import { MessageComponentActionInteraction } from '@/commands/base/actionBase';
import { Event } from '@/generated/prisma/client';
import { eventReviewCommand } from '@/commands/eventCommand/EventReviewCommand';
import { userManager } from '@/domain/services/UserManager';

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

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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

    // 選択されたユーザーのIDを取得
    const selectedUsers = await Promise.all(
      interaction.members.map((member) => userManager.getOrCreateUser(member)),
    );

    // 削除したユーザーを抽出
    const removeUsers = await Promise.all(
      selectedUserIds
        .filter(
          (userId) => !selectedUsers.some((user) => user.userId === userId),
        )
        .map((userId) => userManager.getUser(userId)),
    ).then((users) =>
      users.filter(
        (user): user is NonNullable<typeof user> => user !== undefined,
      ),
    );
    // 逆に追加したユーザーを抽出
    const addUsers = selectedUsers.filter(
      (user) => !selectedUserIds.includes(user.userId),
    );
    // 出席としてマークするユーザー
    const markUsers = [...removeUsers, ...addUsers];

    // 出席としてマーク
    await eventReviewCommand.addToHistory(interaction, event);
    await eventReviewCommand.setShowStats(
      event,
      markUsers.map((user) => user.id),
      true,
    );
    await interaction.editReply({
      content: `${markUsers
        .map((user) => `<@${user.userId}>`)
        .join('')} を☑️出席としてマークしました`,
    });

    // インタラクションが保存されている場合は更新
    await eventReviewCommand.updateReviewEventMessage(interaction, event);
  }
}

/**
 * ReviewMarkUserSelectActionのインスタンス
 */
export const reviewMarkUserSelectAction = new ReviewMarkUserSelectAction(
  'rmrk',
  ComponentType.UserSelect,
);
