import {
  ContextMenuCommandBuilder,
  PermissionFlagsBits,
  UserContextMenuCommandInteraction,
} from 'discord.js';
import { UserContextMenuInteraction } from '../base/contextmenu_base.js';
import eventManager from '../../event/EventManager.js';
import eventReviewCommand from '../event_command/EventReviewCommand.js';
import { prisma } from '../../index.js';

class MarkHideUserMenu extends UserContextMenuInteraction {
  command = new ContextMenuCommandBuilder()
    .setName('[X]欠席としてマーク')
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

    // 現在のユーザーの出欠状態を確認
    const currentStat = await prisma.userStat.findUnique({
      where: {
        id: {
          eventId: event.id,
          userId: interaction.targetUser.id,
        },
      },
    });
    const isCurrentlyHide = currentStat?.show === false;

    await eventReviewCommand.addToHistory(interaction, event);

    if (isCurrentlyHide) {
      // 既に欠席状態の場合は、出欠をクリア
      await eventReviewCommand.setShowStats(
        event,
        [interaction.targetUser.id],
        null,
      );
      await interaction.editReply({
        content: `<@${interaction.targetUser.id}> の⬛出欠をクリアしました`,
      });
    } else {
      // 欠席状態でない場合は、欠席としてマーク
      await eventReviewCommand.setShowStats(
        event,
        [interaction.targetUser.id],
        false,
      );
      await interaction.editReply({
        content: `<@${interaction.targetUser.id}> を❌欠席としてマークしました`,
      });
    }

    // イベントの出欠状況を表示するメッセージを更新
    await eventReviewCommand.updateReviewEventMessage(interaction, event);
  }
}

export default new MarkHideUserMenu();
