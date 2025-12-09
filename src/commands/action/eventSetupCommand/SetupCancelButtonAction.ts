import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} from 'discord.js';
import { MessageComponentActionInteraction } from '@/commands/base/actionBase';
import { eventCreatorSetupCommand } from '@/commands/eventCreatorCommand/EventCreatorSetupCommand';

class SetupCancelButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  /**
   * ボタンを作成
   * @param enabled 有効化するかどうか
   * @returns 作成したビルダー
   */
  override create(enabled: boolean): ButtonBuilder {
    const customId = this.createCustomId();

    return new ButtonBuilder()
      .setCustomId(customId)
      .setLabel('変更を取り消す')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!enabled);
  }

  /** @inheritdoc */
  async onCommand(
    interaction: ButtonInteraction,
    _params: URLSearchParams,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const editKey = eventCreatorSetupCommand.key(interaction);
    const editData = eventCreatorSetupCommand.setupPanels[editKey];
    if (!editData) {
      await interaction.editReply({
        content: 'パネルが賞味期限切れです。もう一度出してやり直してください',
      });
      return;
    }

    if (Object.keys(editData.pendingChanges).length === 0) {
      await interaction.editReply({
        content: '取り消す変更がありません。',
      });
      return;
    }

    editData.pendingChanges = {};

    const reply = await eventCreatorSetupCommand.createSetupPanel(interaction);
    if (!reply) return;

    const panelResult = await editData.interaction
      .editReply(reply)
      .catch(() => undefined);
    if (!panelResult) {
      await interaction.editReply(reply);
    }

    await interaction.editReply({
      content: '保留中の変更を取り消しました。',
    });
  }
}

/**
 * SetupCancelButtonActionのインスタンス
 */
export const setupCancelButtonAction = new SetupCancelButtonAction(
  'setupcancel',
  ComponentType.Button,
);
