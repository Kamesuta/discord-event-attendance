import {
  ContextMenuCommandBuilder,
  PermissionFlagsBits,
  UserContextMenuCommandInteraction,
} from 'discord.js';
import { UserContextMenuInteraction } from '../base/contextmenu_base.js';
import eventManager from '../../event/EventManager.js';
import eventReviewCommand from '../event_command/EventReviewCommand.js';
import userManager from '../../event/UserManager.js';

class MarkShowUserMenu extends UserContextMenuInteraction {
  command = new ContextMenuCommandBuilder()
    .setName('[O]出席としてマーク')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);

  async onCommand(
    interaction: UserContextMenuCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    // イベントを取得
    const event = await eventManager.getEvent(interaction);
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }
    // ユーザーを取得
    const user = await userManager.getOrCreateUser(interaction.targetUser);

    // 出席としてマーク
    await eventReviewCommand.addToHistory(interaction, event);
    await eventReviewCommand.setShowStats(event, [user.id], true);
    await interaction.editReply({
      content: `<@${user.userId}> を☑️出席としてマークしました`,
    });

    // イベントの出欠状況を表示するメッセージを更新
    await eventReviewCommand.updateReviewEventMessage(interaction, event);
  }
}

export default new MarkShowUserMenu();
