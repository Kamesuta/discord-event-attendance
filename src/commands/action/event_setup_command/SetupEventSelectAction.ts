import {
  ComponentType,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import eventCreatorSetupCommand from '../../event_creator_command/EventCreatorSetupCommand.js';
import { EventSpec } from '../../../event/EventManager.js';

class SetupEventSelectAction extends MessageComponentActionInteraction<ComponentType.StringSelect> {
  /**
   * ボタンを作成
   * @param events イベントリスト
   * @param selectedEvent 選択中のイベント
   * @returns 作成したビルダー
   */
  override create(
    events: EventSpec[],
    selectedEvent?: EventSpec,
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
        events.map(({ scheduledEvent, event }) => {
          const date = scheduledEvent.scheduledStartAt?.toLocaleDateString(
            'ja-JP',
            { month: '2-digit', day: '2-digit', weekday: 'short' },
          );
          return {
            label: `${date} ${event?.name ?? scheduledEvent.name} (ID: ${event?.id ?? '未生成'})`,
            value: scheduledEvent.id,
            default: scheduledEvent.id === selectedEvent?.scheduledEvent.id,
          };
        }),
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

    // 選択中のイベントを更新
    editData.selectedEvent = eventId;

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

export default new SetupEventSelectAction(
  'setupes',
  ComponentType.StringSelect,
);
