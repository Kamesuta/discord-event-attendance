import {
  ComponentType,
  UserSelectMenuBuilder,
  UserSelectMenuInteraction,
} from 'discord.js';
import eventManager from '../../../event/EventManager.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import { prisma } from '../../../index.js';
import { Event } from '@prisma/client';
import eventAdminSetupCommand from '../../event_admin_command/EventAdminSetupCommand.js';
import { updateSchedules } from '../../../event_handler.js';

class SetupUserSelectAction extends MessageComponentActionInteraction<ComponentType.UserSelect> {
  /**
   * ボタンを作成
   * @param event イベント
   * @returns 作成したビルダー
   */
  override create(event: Event): UserSelectMenuBuilder {
    // カスタムIDを生成
    const customId = this.createCustomId({
      evt: `${event.id}`,
    });

    // ダイアログを作成
    const userSelect = new UserSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(event.name)
      .setMinValues(1)
      .setMaxValues(1);

    if (event.hostId) {
      userSelect.setDefaultUsers([event.hostId]);
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

    // ホストユーザーを取得
    const hostUserId = interaction.values[0];
    const hostUser = await interaction.guild?.members.fetch(hostUserId);
    if (!hostUser) {
      await interaction.editReply({
        content: 'ユーザーが見つかりませんでした',
      });
      return;
    }

    // イベントを更新
    await prisma.event.update({
      where: { id: event.id },
      data: { hostId: hostUserId },
    });

    // パネルを表示
    const reply = await eventAdminSetupCommand.createSetupPanel(interaction);
    if (!reply) return;

    const result = await eventAdminSetupCommand.setupPanels[
      eventAdminSetupCommand.key(interaction)
    ]
      ?.editReply(reply)
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
