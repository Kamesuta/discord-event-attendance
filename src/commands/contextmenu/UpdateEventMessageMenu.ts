import {
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import { MessageContextMenuInteraction } from '../base/contextmenu_base.js';
import eventManager from '../../event/EventManager.js';
import showEvent from '../../event/showEvent.js';
import { updateEvent } from '../../event_handler.js';

class UpdateEventMessageMenu extends MessageContextMenuInteraction {
  command = new ContextMenuCommandBuilder()
    .setName('イベント情報を更新')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);

  async onCommand(
    interaction: MessageContextMenuCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    // EmbedのURLを解析
    const url = interaction.targetMessage.embeds[0]?.url;
    if (!url) {
      await interaction.editReply({
        content: 'イベントお知らせメッセージに対してのみ使用できます',
      });
      return;
    }
    const match = url.match(/\/(\d+)$/);
    if (!match) {
      await interaction.editReply({
        content: 'イベントお知らせメッセージのURLが不正です',
      });
      return;
    }
    const scheduledEventId = match[1];
    // ScheduledEventが取得できれば更新
    const scheduledEvent = await interaction.guild?.scheduledEvents
      .fetch(scheduledEventId)
      .catch(() => undefined);
    if (scheduledEvent) {
      await updateEvent(scheduledEvent);
    }
    // イベント情報を取得
    const event = await eventManager.getEventFromDiscordId(scheduledEventId);
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // メッセージを抽出 (\n\n[～](https://discord.com/events/～) は削除)
    const messageMatch = interaction.targetMessage.content.match(
      /^(.+)(?:\n\n\[(.+)\]\(https:\/\/discord.com\/events\/.+\))?$/,
    );

    // イベント情報を編集
    await showEvent(
      interaction,
      event,
      interaction.channel ?? undefined,
      messageMatch?.[1],
      messageMatch?.[2],
      interaction.targetMessage,
    );

    await interaction.deleteReply();
  }
}

export default new UpdateEventMessageMenu();
