import {
  ContextMenuCommandBuilder,
  PermissionFlagsBits,
  UserContextMenuCommandInteraction,
} from 'discord.js';
import { UserContextMenuInteraction } from '@/commands/base/contextmenuBase';
import { eventManager } from '@/domain/services/EventManager';
import { eventReviewCommand } from '@/commands/eventCommand/EventReviewCommand';
import { userManager } from '@/domain/services/UserManager';
import { prisma } from '@/utils/prisma';

class MarkHideUserMenu extends UserContextMenuInteraction {
  command = new ContextMenuCommandBuilder()
    .setName('[X]欠席としてマーク')
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
    const user = await userManager.getOrCreateUser(
      interaction.targetMember ?? interaction.targetUser,
    );

    // 現在のユーザーの出欠状態を確認
    const currentStat = await prisma.userStat.findUnique({
      where: {
        id: {
          eventId: event.id,
          userId: user.id,
        },
      },
    });
    const isCurrentlyHide = currentStat?.show === false;

    await eventReviewCommand.addToHistory(interaction, event);

    if (isCurrentlyHide) {
      // 既に欠席状態の場合は、出欠をクリア
      await eventReviewCommand.setShowStats(event, [user.id], null);
      await interaction.editReply({
        content: `<@${user.userId}> の⬛出欠をクリアしました`,
      });
    } else {
      // 欠席状態でない場合は、欠席としてマーク
      await eventReviewCommand.setShowStats(event, [user.id], false);
      await interaction.editReply({
        content: `<@${user.userId}> を❌欠席としてマークしました`,
      });
    }

    // インタラクションが保存されている場合は更新
    await eventReviewCommand.updateReviewEventMessage(interaction, event);
  }
}

/**
 * MarkHideUserMenuのインスタンス
 */
export const markHideUserMenu = new MarkHideUserMenu();
