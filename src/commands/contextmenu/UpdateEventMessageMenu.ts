import {
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { MessageContextMenuInteraction } from '@/commands/base/contextmenuBase';
import { messageUpdateManager } from '@/bot/client';

class UpdateEventMessageMenu extends MessageContextMenuInteraction {
  command = new ContextMenuCommandBuilder()
    .setName('イベント情報を更新')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);

  async onCommand(
    interaction: MessageContextMenuCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
