import {
  ContextMenuCommandBuilder,
  PermissionFlagsBits,
  UserContextMenuCommandInteraction,
} from 'discord.js';
import { UserContextMenuInteraction } from '../base/contextmenu_base.js';
import eventManager from '../../event/EventManager.js';
import { prisma } from '../../utils/prisma.js';
import setMemoAction from '../action/SetMemoAction.js';
import userManager from '../../event/UserManager.js';

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

    // ユーザーを作成 or 取得
    const user = await userManager.getOrCreateUser(
      interaction.targetMember ?? interaction.targetUser,
    );

    // 現在のメモを取得
    const userStat = await prisma.userStat.findFirst({
      where: {
        eventId: event.id,
        userId: user.id,
      },
    });

    // メモ入力モーダルを表示
    await interaction.showModal(
      setMemoAction.create(interaction.targetUser, event, userStat?.memo ?? ''),
    );
  }
}

export default new SetMemoUserMenu();
