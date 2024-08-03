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
import { Event } from '@prisma/client';

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
   * @returns イベント
   */
  async updateMessage(
    interaction: RepliableInteraction,
    message: Message,
  ): Promise<Event> {
    // DiscordイベントIDを取得 (取得できない場合はエラーをthrow)
    const eventId = this.parseMessageEventId(message);
    if (!eventId) {
      throw 'イベントが見つかりませんでした';
    }
    // イベント情報を取得
    const event = await eventManager.getEventFromId(eventId);
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

    return event;
  }

  /**
   * イベントお知らせメッセージからイベントIDを取得
   * @param message メッセージ
   * @returns イベントID
   */
  parseMessageEventId(message: Message): number {
    // EmbedのURLを解析
    const footerText = message.embeds
      .flatMap((embed) => {
        const footerText = embed.footer?.text;
        return footerText ? [footerText] : [];
      })
      .flatMap((footerText) => {
        const match = footerText.match(/イベントID: (\d+)/);
        return match ? [parseInt(match[1])] : [];
      })[0];
    if (!footerText || isNaN(footerText)) {
      throw 'イベントお知らせメッセージに対してのみ使用できます';
    }
    return footerText;
  }
}

export default new UpdateEventMessageMenu();
