import {
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import { MessageContextMenuInteraction } from '../base/contextmenu_base.js';
import eventOpUpdateMessageCommand from '../event_op_command/EventOpUpdateMessageCommand.js';

class UpdateEventMessageMenu extends MessageContextMenuInteraction {
  command = new ContextMenuCommandBuilder()
    .setName('イベント情報を更新')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);

  async onCommand(
    interaction: MessageContextMenuCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const event = await eventOpUpdateMessageCommand.updateMessage(
        interaction,
        interaction.targetMessage,
      );

      // 結果を返信
      await interaction.editReply({
        content: `イベント「${event.name}」(ID: ${event.id})の[情報](${interaction.targetMessage.url})を更新しました`,
      });
    } catch (error) {
      if (typeof error !== 'string') throw error;

      await interaction.editReply({
        content: error,
      });
      return;
    }
  }
}

export default new UpdateEventMessageMenu();
