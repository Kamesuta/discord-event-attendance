import {
  ComponentType,
  UserSelectMenuBuilder,
  UserSelectMenuInteraction,
} from 'discord.js';
import eventManager, { eventIncludeHost } from '../../../event/EventManager.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import { prisma } from '../../../utils/prisma.js';
import {
  onCreateScheduledEvent,
  updateSchedules,
} from '../../../event_handler.js';
import eventCreatorSetupCommand, {
  EventSpec,
} from '../../event_creator_command/EventCreatorSetupCommand.js';
import userManager from '../../../event/UserManager.js';
import { messageUpdateManager } from '../../../utils/client.js';
import { logger } from '../../../utils/log.js';

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

    if (event?.event?.preparer?.userId) {
      userSelect.setDefaultUsers([event.event.preparer.userId]);
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

    await interaction.deferReply({ ephemeral: true });

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
    const preparerUser = preparerUserMember
      ? await userManager.getOrCreateUser(preparerUserMember)
      : undefined;

    // イベントを取得
    let event =
      (await eventManager.getEventFromDiscordId(eventId)) ?? undefined;
    if (!event) {
      // イベントを作成
      const scheduledEvent = await interaction.guild?.scheduledEvents
        .fetch(eventId)
        .catch(() => undefined);
      if (!scheduledEvent) {
        await interaction.editReply({
          content: 'Discordイベントが見つかりませんでした',
        });
        return;
      }
      event = await onCreateScheduledEvent(scheduledEvent);
      if (!event) {
        await interaction.editReply({
          content: 'イベントの作成に失敗しました',
        });
        return;
      }
    }

    // イベントを更新
    const updatedEvent = await prisma.event.update({
      where: { id: event.id },
      data: { preparerId: preparerUser?.id ?? null },
      ...eventIncludeHost,
    });

    // イベントに関連する全メッセージを更新
    if (updatedEvent) {
      try {
        const updatedMessages =
          await messageUpdateManager.updateRelatedMessages(updatedEvent);
        logger.info(
          `準備者変更によりイベント ${updatedEvent.id} の関連メッセージ ${updatedMessages.length} 件を更新`,
        );
      } catch (error) {
        logger.error(
          `関連メッセージ更新中にエラーが発生しました: ${String(error)}`,
        );
      }
    }

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

    // スケジュールを更新
    await updateSchedules();
  }
}

export default new SetupPreparerSelectAction(
  'setuppr',
  ComponentType.UserSelect,
);
