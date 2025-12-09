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

class SetupPreparerSelectAction extends MessageComponentActionInteraction<ComponentType.UserSelect> {
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
      .setPlaceholder('準備者を選択してください')
      .setMinValues(0)
      .setMaxValues(1);

    const preparerUserId =
      event?.pendingChange?.preparerDiscordId !== undefined
        ? (event.pendingChange.preparerDiscordId ?? undefined)
        : event?.event?.preparer?.userId;

    if (preparerUserId) {
      userSelect.setDefaultUsers([preparerUserId]);
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

    // 準備者ユーザーを取得
    const preparerUserMember = interaction.members.first();
    const preparerDiscordId = preparerUserMember?.user.id ?? null;

    // イベントを取得（既存値との比較用）
    const event =
      (await eventManager.getEventFromDiscordId(eventId)) ?? undefined;

    // 保留中の変更として保存
    eventCreatorSetupCommand.updatePendingChanges(
      editData,
      eventId,
      {
        preparerDiscordId,
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
 * SetupPreparerSelectActionのインスタンス
 */
export const setupPreparerSelectAction = new SetupPreparerSelectAction(
  'setuppr',
  ComponentType.UserSelect,
);
