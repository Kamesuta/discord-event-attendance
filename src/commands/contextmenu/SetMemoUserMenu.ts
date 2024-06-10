import {
  ContextMenuCommandBuilder,
  PermissionFlagsBits,
  UserContextMenuCommandInteraction,
} from 'discord.js';
import { UserContextMenuInteraction } from '../base/contextmenu_base.js';
import eventManager from '../../event/EventManager.js';
import { prisma } from '../../index.js';
import setMemoAction from '../action/SetMemoAction.js';

class SetMemoUserMenu extends UserContextMenuInteraction {
  command = new ContextMenuCommandBuilder()
    .setName('メモを設定')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);

  async onCommand(
    interaction: UserContextMenuCommandInteraction,
  ): Promise<void> {
    const event = await eventManager.getEvent(interaction);
    if (!event) {
      await interaction.reply({
        ephemeral: true,
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // 現在のメモを取得
    const userStat = await prisma.userStat.findFirst({
      where: {
        eventId: event.id,
        userId: interaction.targetUser.id,
      },
    });

    // メモ入力モーダルを表示
    await interaction.showModal(
      setMemoAction.create(interaction.targetUser, event, userStat?.memo ?? ''),
    );
  }
}

export default new SetMemoUserMenu();
