import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import getWebhook from '../../event/getWebhook.js';
import { messageUpdateManager } from '../../utils/client.js';
import { MessageUpdateContext } from '../../event/MessageUpdater.js';
import eventOpCommand from './EventOpCommand.js';

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

    // Webhook経由でメッセージを取得
    const webhook = await getWebhook(interaction);
    const message = await webhook?.webhook
      .fetchMessage(messageId)
      .catch(() => undefined);
    if (!message) {
      await interaction.editReply({
        content: 'メッセージが見つかりませんでした',
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

export default new EventOpUpdateMessageCommand(eventOpCommand);
