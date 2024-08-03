import {
  ChatInputCommandInteraction,
  Message,
  RepliableInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventAdminCommand from './EventAdminCommand.js';
import getWebhook from '../../event/getWebhook.js';
import showEvent from '../../event/showEvent.js';
import eventManager from '../../event/EventManager.js';
import { Event } from '@prisma/client';
import { logger } from '../../utils/log.js';

class EventAdminUpdateMessageCommand extends SubcommandInteraction {
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
        .setDescription('イベントID (強制的にこのイベントに変更)')
        .setRequired(false),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    // メッセージを取得
    const messageId = interaction.options.getString('message');
    if (!messageId) return;
    // Webhook経由でメッセージを取得
    const webhook = await getWebhook(interaction);
    const message = await webhook?.webhook.fetchMessage(messageId);
    if (!message) {
      await interaction.editReply({
        content: 'メッセージが見つかりませんでした',
      });
      return;
    }

    const eventId = interaction.options.getNumber('event_id');
    try {
      // イベントメッセージを更新
      const event = eventId
        ? await this.updateEventMessage(interaction, message, eventId)
        : await this.updateMessage(interaction, message);

      // ログを出力
      logger.log(
        `イベント「${event.name}」(ID: ${event.id})のメッセージを更新しました`,
      );

      // 結果を返信
      await interaction.editReply({
        content: `イベント「${event.name}」(ID: ${event.id})の[情報](${message.url})のメッセージを更新しました`,
      });
    } catch (error) {
      if (typeof error !== 'string') throw error;

      await interaction.editReply({
        content: error,
      });
      return;
    }
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

    // イベント情報を編集
    return await this.updateEventMessage(interaction, message, eventId);
  }

  /**
   * イベントお知らせメッセージを更新
   * @param interaction インタラクション
   * @param message メッセージ
   * @param eventId イベントID
   * @returns イベント
   */
  async updateEventMessage(
    interaction: RepliableInteraction,
    message: Message,
    eventId: number,
  ): Promise<Event> {
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

export default new EventAdminUpdateMessageCommand(eventAdminCommand);
