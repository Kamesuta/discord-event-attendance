import {
  ContextMenuCommandBuilder,
  Message,
  MessageContextMenuCommandInteraction,
  PermissionFlagsBits,
  RepliableInteraction,
} from 'discord.js';
import { MessageContextMenuInteraction } from '../base/contextmenu_base.js';
import eventManager from '../../event/EventManager.js';
import showEvent from '../../event/showEvent.js';
import { onUpdateScheduledEvent } from '../../event_handler.js';

class UpdateEventMessageMenu extends MessageContextMenuInteraction {
  command = new ContextMenuCommandBuilder()
    .setName('イベント情報を更新')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);

  async onCommand(
    interaction: MessageContextMenuCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      await this.updateMessage(interaction, interaction.targetMessage);
    } catch (error) {
      if (typeof error !== 'string') throw error;

      await interaction.editReply({
        content: error,
      });
      return;
    }

    await interaction.deleteReply();
  }

  /**
   * イベントお知らせメッセージを更新
   * @param interaction インタラクション
   * @param message メッセージ
   */
  async updateMessage(
    interaction: RepliableInteraction,
    message: Message,
  ): Promise<void> {
    // DiscordイベントIDを取得 (取得できない場合はエラーをthrow)
    const scheduledEventId = this.parseScheduledEventId(message);

    if (!scheduledEventId) {
      throw 'イベントが見つかりませんでした';
    }
    // ScheduledEventが取得できれば更新
    const scheduledEvent = await interaction.guild?.scheduledEvents
      .fetch(scheduledEventId)
      .catch(() => undefined);
    if (scheduledEvent) {
      await onUpdateScheduledEvent(scheduledEvent);
    }
    // イベント情報を取得
    const event = await eventManager.getEventFromDiscordId(scheduledEventId);
    if (!event) {
      throw 'イベントが見つかりませんでした';
    }

    // メッセージを抽出 (\n\n[～](https://discord.com/events/～) は削除)
    const messageMatch = message.content.match(
      /^(.+)(?:\n\n\[(.+)\]\(https:\/\/discord.com\/events\/.+\))?$/,
    );

    // イベント情報を編集
    await showEvent(
      interaction,
      event,
      message.channel ?? undefined,
      messageMatch?.[1],
      messageMatch?.[2],
      message,
    );
  }

  /**
   * イベントお知らせメッセージからScheduledEventのIDを取得
   * @param message メッセージ
   * @returns ScheduledEventのID
   */
  parseScheduledEventId(message: Message): string {
    // EmbedのURLを解析
    const url = message.embeds[0]?.url;
    if (!url) {
      throw 'イベントお知らせメッセージに対してのみ使用できます';
    }
    const match = url.match(/\/(\d+)$/);
    if (!match) {
      throw 'イベントお知らせメッセージのURLが不正です';
    }
    return match[1];
  }
}

export default new UpdateEventMessageMenu();
