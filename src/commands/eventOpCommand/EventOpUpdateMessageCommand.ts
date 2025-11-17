import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/commandBase.js';
import { messageUpdateManager } from '../../bot/client.js';
import { messageEditor } from '../../bot/interactions/MessageEditor.js';
import { MessageUpdateContext } from '../../messageUpdaters/MessageUpdater.js';
import { eventOpCommand } from './EventOpCommand.js';

class EventOpUpdateMessageCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('update_message')
    .setDescription('イベント情報を更新')
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('イベントのメッセージ')
        .setRequired(true),
    )
    .addNumberOption((option) =>
      option
        .setName('event_id')
        .setDescription(
          'イベントID (強制的にこのイベントに変更、単一イベント情報メッセージのみに対して有効)',
        )
        .setRequired(false),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    // メッセージを取得
    const messageId = interaction.options.getString('message');
    const forceEventId = interaction.options.getNumber('event_id');
    if (!messageId) return;

    // チャンネルを確認
    if (!interaction.channel) {
      await interaction.editReply({
        content: 'このコマンドはサーバー内でのみ使用できます',
      });
      return;
    }

    // メッセージを取得（Webhook/通常を自動切り替え）
    let message;
    try {
      message = await messageEditor.fetchMessage(
        messageId,
        interaction.channel,
      );
    } catch (error) {
      await interaction.editReply({
        content:
          typeof error === 'string'
            ? error
            : 'メッセージが見つかりませんでした',
      });
      return;
    }

    try {
      // コンテキストを作成
      const context: MessageUpdateContext = {
        forceEventId: forceEventId ?? undefined,
      };

      // メッセージを更新
      const updatedMessage = await messageUpdateManager.updateMessage(
        message,
        context,
      );

      // 結果を返信
      await interaction.editReply({
        content: `[メッセージ](${updatedMessage?.url ?? message.url})を更新しました`,
      });
    } catch (error) {
      await interaction.editReply({
        content:
          typeof error === 'string' ? error : 'メッセージの更新に失敗しました',
      });
      return;
    }
  }
}

/**
 * EventOpUpdateMessageCommandのインスタンス
 */
export const eventOpUpdateMessageCommand = new EventOpUpdateMessageCommand(
  eventOpCommand,
);
