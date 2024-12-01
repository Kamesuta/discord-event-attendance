import {
  ComponentType,
  UserSelectMenuBuilder,
  UserSelectMenuInteraction,
} from 'discord.js';
import eventManager from '../../../event/EventManager.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import { prisma } from '../../../index.js';
import eventAdminSetupCommand, {
  EventSpec,
} from '../../event_admin_command/EventAdminSetupCommand.js';
import {
  onCreateScheduledEvent,
  updateSchedules,
} from '../../../event_handler.js';

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
      .setPlaceholder(event?.event?.name ?? 'ユーザーを選択してください')
      .setMinValues(1)
      .setMaxValues(1);

    if (event?.event?.hostId) {
      userSelect.setDefaultUsers([event.event.hostId]);
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
      eventAdminSetupCommand.setupPanels[
        eventAdminSetupCommand.key(interaction)
      ];
    if (!editData) {
      await interaction.editReply({
        content: 'パネルが賞味期限切れです。もう一度出してやり直してください',
      });
      return;
    }

    // ホストユーザーを取得
    const hostUserId = interaction.values[0];
    const hostUser = await interaction.guild?.members.fetch(hostUserId);
    if (!hostUser) {
      await interaction.editReply({
        content: 'ユーザーが見つかりませんでした',
      });
      return;
    }

    // イベントを取得
    let event =
      (await eventManager.getEventFromDiscordId(eventId)) ?? undefined;
    if (!event) {
      // イベントを作成
      const scheduledEvent =
        await interaction.guild?.scheduledEvents.fetch(eventId);
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
    await prisma.event.update({
      where: { id: event.id },
      data: { hostId: hostUserId },
    });

    // パネルを表示
    const reply = await eventAdminSetupCommand.createSetupPanel(interaction);
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

export default new SetupUserSelectAction('setupus', ComponentType.UserSelect);
