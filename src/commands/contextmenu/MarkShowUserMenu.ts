import {
  ContextMenuCommandBuilder,
  PermissionFlagsBits,
  UserContextMenuCommandInteraction,
} from 'discord.js';
import { UserContextMenuInteraction } from '../base/contextmenu_base.js';
import { getEventFromId } from '../../event/event.js';
import setShowStats from '../../event/setShowStats.js';

class MarkShowUserMenu extends UserContextMenuInteraction {
  command = new ContextMenuCommandBuilder()
    .setName('[O]出席としてマーク')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);

  async onCommand(
    interaction: UserContextMenuCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    const event = await getEventFromId(undefined);
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }
    await setShowStats(event, [interaction.targetUser.id], true);
    await interaction.editReply({
      content: `<@${interaction.targetUser.id}> を☑️出席としてマークしました`,
    });
  }
}

export default new MarkShowUserMenu();