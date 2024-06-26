import {
  ContextMenuCommandBuilder,
  PermissionFlagsBits,
  UserContextMenuCommandInteraction,
} from 'discord.js';
import { UserContextMenuInteraction } from '../base/contextmenu_base.js';
import eventManager from '../../event/EventManager.js';
import eventReviewCommand from '../event_command/EventReviewCommand.js';

class MarkClearUserMenu extends UserContextMenuInteraction {
  command = new ContextMenuCommandBuilder()
    .setName('[_]出欠をクリア')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);

  async onCommand(
    interaction: UserContextMenuCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    const event = await eventManager.getEvent(interaction);
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }
    await eventReviewCommand.addToHistory(interaction, event);
    await eventReviewCommand.setShowStats(
      event,
      [interaction.targetUser.id],
      null,
    );
    await interaction.editReply({
      content: `<@${interaction.targetUser.id}> の⬛出欠をクリアしました`,
    });

    // イベントの出欠状況を表示するメッセージを更新
    await eventReviewCommand.updateReviewEventMessage(interaction, event);
  }
}

export default new MarkClearUserMenu();
