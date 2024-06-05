import {
  ActionRowBuilder,
  ContextMenuCommandBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  UserContextMenuCommandInteraction,
} from 'discord.js';
import { UserContextMenuInteraction } from '../base/contextmenu_base.js';
import { getEventFromId } from '../../event/event.js';
import { prisma } from '../../index.js';

class SetMemoUserMenu extends UserContextMenuInteraction {
  command = new ContextMenuCommandBuilder()
    .setName('メモを設定')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);

  async onCommand(
    interaction: UserContextMenuCommandInteraction,
  ): Promise<void> {
    const event = await getEventFromId(undefined);
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

    // メモ入力欄を作成
    const textInput = new TextInputBuilder()
      .setCustomId('memo')
      .setLabel('メモを入力してください (「!」を入力で削除)')
      .setMinLength(0)
      .setMaxLength(512)
      .setStyle(TextInputStyle.Short)
      .setValue(userStat?.memo ?? '');

    // メモ入力モーダルを表示
    await interaction.showModal(
      new ModalBuilder()
        .setTitle('メモ入力')
        .setCustomId(
          `event_modal_memo_${interaction.targetUser.id}_${event.id}`,
        )
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(textInput),
        ),
    );
  }
}

export default new SetMemoUserMenu();
