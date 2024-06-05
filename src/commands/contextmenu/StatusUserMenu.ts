import {
  ContextMenuCommandBuilder,
  UserContextMenuCommandInteraction,
} from 'discord.js';
import { UserContextMenuInteraction } from '../base/contextmenu_base.js';
import showUserStatus from '../../event/showUserStatus.js';

class StatusUserMenu extends UserContextMenuInteraction {
  command = new ContextMenuCommandBuilder().setName('イベントの参加状況を確認');

  async onCommand(
    interaction: UserContextMenuCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    await showUserStatus(interaction, interaction.targetUser.id);
  }
}

export default new StatusUserMenu();
