import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { MessageComponentActionInteraction } from '@/commands/base/actionBase';
import {
  eventCreatorSetupCommand,
  EventSpec,
} from '@/commands/eventCreatorCommand/EventCreatorSetupCommand';
import { setupTagEditModalAction } from './SetupTagEditModalAction';

class SetupTagEditAction extends MessageComponentActionInteraction<ComponentType.Button> {
  /**
   * ボタンを作成
   * @param event イベント
   * @returns 作成したビルダー
   */
  override create(event?: EventSpec): ButtonBuilder {
    const customId = this.createCustomId({
      evt: `${event?.scheduledEvent.id ?? ''}`,
    });

    return new ButtonBuilder()
      .setCustomId(customId)
      .setLabel('タグを編集')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!event);
  }

  /** @inheritdoc */
  async onCommand(
    interaction: ButtonInteraction,
    params: URLSearchParams,
  ): Promise<void> {
    const eventId = params.get('evt');
    if (!eventId) {
      await interaction.reply({
        content:
          'イベントが選択されていません。もう一度セットアップパネルを開いてください。',
        ephemeral: true,
      });
      return;
    }

    const editData =
      eventCreatorSetupCommand.setupPanels[
        eventCreatorSetupCommand.key(interaction)
      ];
    if (!editData) {
      await interaction.reply({
        content: 'パネルが賞味期限切れです。もう一度出してやり直してください',
        ephemeral: true,
      });
      return;
    }

    const tagState = editData.tagEdits?.[eventId];
    if (!tagState) {
      await interaction.reply({
        content:
          'タグ情報が見つかりませんでした。もう一度セットアップパネルを開いてください。',
        ephemeral: true,
      });
      return;
    }

    const eventName =
      eventCreatorSetupCommand.scheduledEvents?.get(eventId)?.name ??
      'イベント';
    const modal = setupTagEditModalAction.create({
      eventId,
      eventName,
      tagState,
    });
    await interaction.showModal(modal);
  }
}

/**
 * SetupTagEditActionのインスタンス
 */
export const setupTagEditAction = new SetupTagEditAction(
  'setuptg',
  ComponentType.Button,
);
