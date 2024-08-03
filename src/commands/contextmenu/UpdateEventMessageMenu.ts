import {
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import { MessageContextMenuInteraction } from '../base/contextmenu_base.js';
import eventAdminUpdateMessageCommand from '../event_admin_command/EventAdminUpdateMessageCommand.js';

class UpdateEventMessageMenu extends MessageContextMenuInteraction {
  command = new ContextMenuCommandBuilder()
    .setName('イベント情報を更新')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);

  async onCommand(
    interaction: MessageContextMenuCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      await eventAdminUpdateMessageCommand.updateMessage(
        interaction,
        interaction.targetMessage,
      );
    } catch (error) {
      if (typeof error !== 'string') throw error;

      await interaction.editReply({
        content: error,
      });
      return;
    }

    await interaction.deleteReply();
  }
}

export default new UpdateEventMessageMenu();
