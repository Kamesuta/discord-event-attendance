import {
  ContextMenuCommandBuilder,
  PermissionFlagsBits,
  UserContextMenuCommandInteraction,
} from 'discord.js';
import { UserContextMenuInteraction } from '../base/contextmenu_base.js';
import { getEventFromId } from '../../event/event.js';
import setShowStats from '../../event/setShowStats.js';

class MarkClearUserMenu extends UserContextMenuInteraction {
  command = new ContextMenuCommandBuilder()
    .setName('[_]出欠をクリア')
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
    await setShowStats(event, [interaction.targetUser.id], null);
    await interaction.editReply({
      content: `<@${interaction.targetUser.id}> の⬛出欠をクリアしました`,
    });
  }
}

export default new MarkClearUserMenu();
