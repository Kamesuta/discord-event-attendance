import {
  ContextMenuCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  UserContextMenuCommandInteraction,
} from 'discord.js';
import { UserContextMenuInteraction } from '@/commands/base/contextmenuBase';
import { eventManager } from '@/domain/services/EventManager';
import { eventReviewCommand } from '@/commands/eventCommand/EventReviewCommand';
import { userManager } from '@/domain/services/UserManager';

class MarkShowUserMenu extends UserContextMenuInteraction {
  command = new ContextMenuCommandBuilder()
    .setName('[O]出席としてマーク')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);

  async onCommand(
    interaction: UserContextMenuCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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

/**
 * MarkShowUserMenuのインスタンス
 */
export const markShowUserMenu = new MarkShowUserMenu();
