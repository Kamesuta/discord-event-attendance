import {
  ComponentType,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';
import eventManager from '../../../event/EventManager.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import { prisma } from '../../../index.js';
import { Event } from '@prisma/client';
import eventAdminSetupCommand from '../../event_admin_command/EventAdminSetupCommand.js';

class SetupEventSelectAction extends MessageComponentActionInteraction<ComponentType.StringSelect> {
  /**
   * ボタンを作成
   * @param events イベントリスト
   * @param selectedEvent 選択中のイベント
   * @returns 作成したビルダー
   */
  override create(
    events: Event[],
    selectedEvent?: Event,
  ): StringSelectMenuBuilder {
    // カスタムIDを生成
    const customId = this.createCustomId();

    // ダイアログを作成
    const eventSelect = new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('設定するイベントを選択してください')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        events.map((event) => ({
          label: `${event.name} (ID: ${event.id})`,
          value: event.id.toString(),
          default: event.id === selectedEvent?.id,
        })),
      );

    return eventSelect;
  }

  /** @inheritdoc */
  async onCommand(
    interaction: StringSelectMenuInteraction,
    _params: URLSearchParams,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    // イベントを取得
    const eventId = interaction.values[0];
    const event = await eventManager.getEventFromId(
      eventId ? parseInt(eventId) : undefined,
    );
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

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

    // 選択中のイベントを更新
    editData.selectedEvent = event.id;

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
  }
}

export default new SetupEventSelectAction(
  'setupes',
  ComponentType.StringSelect,
);
