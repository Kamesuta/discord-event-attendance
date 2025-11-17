import {
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import { MessageContextMenuInteraction } from '../base/contextmenu_base.js';
import { messageUpdateManager } from '../../bot/client.js';

class UpdateEventMessageMenu extends MessageContextMenuInteraction {
  command = new ContextMenuCommandBuilder()
    .setName('イベント情報を更新')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);

  async onCommand(
    interaction: MessageContextMenuCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const updatedMessage = await messageUpdateManager.updateMessage(
        interaction.targetMessage,
      );

      // 結果を返信
      await interaction.editReply({
        content: `[メッセージ](${updatedMessage?.url ?? interaction.targetMessage.url})を更新しました`,
      });
    } catch (error) {
      await interaction.editReply({
        content:
          typeof error === 'string' ? error : 'メッセージの更新に失敗しました',
      });
    }
  }
}

/**
 * UpdateEventMessageMenuのインスタンス
 */
export const updateEventMessageMenu = new UpdateEventMessageMenu();
