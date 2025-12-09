import {
  ComponentType,
  MessageFlags,
  UserSelectMenuBuilder,
  UserSelectMenuInteraction,
} from 'discord.js';
import { eventManager } from '@/domain/services/EventManager';
import { MessageComponentActionInteraction } from '@/commands/base/actionBase';
import {
  eventCreatorSetupCommand,
  EventSpec,
} from '@/commands/eventCreatorCommand/EventCreatorSetupCommand';

class SetupUserSelectAction extends MessageComponentActionInteraction<ComponentType.UserSelect> {
  /**
   * ボタンを作成
   * @param event イベント
   * @returns 作成したビルダー
   */
  override create(event?: EventSpec): UserSelectMenuBuilder {
    // カスタムIDを生成
    const customId = this.createCustomId({
      evt: `${event?.scheduledEvent.id ?? 0}`,
    });

    // ダイアログを作成
    const userSelect = new UserSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('主催者を選択してください')
      .setMinValues(0)
      .setMaxValues(1);

    const hostUserId =
      event?.pendingChange?.hostDiscordId !== undefined
        ? (event.pendingChange.hostDiscordId ?? undefined)
        : event?.event?.host?.userId;

    if (hostUserId) {
      userSelect.setDefaultUsers([hostUserId]);
    }

    return userSelect;
  }

  /** @inheritdoc */
  async onCommand(
    interaction: UserSelectMenuInteraction,
    params: URLSearchParams,
  ): Promise<void> {
    const eventId = params.get('evt');
    if (!eventId) return; // 必要なパラメータがない場合は旧形式の可能性があるため無視

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // パネルを取得
    const editData =
      eventCreatorSetupCommand.setupPanels[
        eventCreatorSetupCommand.key(interaction)
      ];
    if (!editData) {
      await interaction.editReply({
        content: 'パネルが賞味期限切れです。もう一度出してやり直してください',
      });
      return;
    }

    // ホストユーザーを取得
    const hostUserMember = interaction.members.first();
    const hostDiscordId = hostUserMember?.user.id ?? null;

    // イベントを取得（既存値との比較用）
    const event =
      (await eventManager.getEventFromDiscordId(eventId)) ?? undefined;

    // 保留中の変更として保存
    eventCreatorSetupCommand.updatePendingChanges(
      editData,
      eventId,
      {
        hostDiscordId,
      },
      event,
    );

    // パネルを表示
    const reply = await eventCreatorSetupCommand.createSetupPanel(interaction);
    if (!reply) return;

    // パネルを更新
    const result = await editData?.interaction
      .editReply(reply)
      .catch(() => undefined);
    if (!result) {
      await interaction.editReply(reply);
    } else {
      await interaction.deleteReply();
    }
  }
}

/**
 * SetupUserSelectActionのインスタンス
 */
export const setupUserSelectAction = new SetupUserSelectAction(
  'setupus',
  ComponentType.UserSelect,
);
