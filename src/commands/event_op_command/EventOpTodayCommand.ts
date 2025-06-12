import {
  ChatInputCommandInteraction,
  Message,
  SlashCommandSubcommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  GuildScheduledEvent,
  GuildTextBasedChannel,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import { config } from '../../utils/config.js';
import eventManager, { EventWithHost } from '../../event/EventManager.js';
import eventOpCommand from './EventOpCommand.js';
import addRoleButtonAction from '../action/AddRoleButtonAction.js';
import { logger } from '../../utils/log.js';
import { client } from '../../index.js';

class EventOpTodayCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('today')
    .setDescription('本日のイベント予定を表示します');

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    // イベントを取得
    const event = await eventManager.getEvent(interaction);
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // その日のイベントを取得
    const scheduledEvent = await interaction.guild?.scheduledEvents.fetch(
      event.eventId,
    );
    if (!scheduledEvent) {
      await interaction.editReply({
        content: 'Discordイベントが見つかりませんでした',
      });
      return;
    }

    // アナウンスチャンネルを取得
    const channel = scheduledEvent.guild?.channels.cache.get(
      config.schedule_channel_id,
    );
    if (!channel?.isTextBased()) {
      await interaction?.editReply({
        content: 'アナウンスチャンネルが見つかりませんでした',
      });
      return;
    }

    // イベントをアナウンス
    const message = await this.showTodayMessage(channel, scheduledEvent, event);

    // 返信
    await interaction.editReply({
      content: `イベント予定を表示しました: ${message?.url ?? '不明'}`,
    });
  }

  /**
   * 本日のイベント予定を表示します
   * @param channel チャンネル
   * @param scheduledEvent スケジュールイベント
   * @param event イベント
   * @returns 送信したメッセージ
   */
  async showTodayMessage(
    channel: GuildTextBasedChannel,
    scheduledEvent: GuildScheduledEvent,
    event: EventWithHost,
  ): Promise<Message | undefined> {
    // 前回のアナウンスメッセージを削除
    const prevMessages = await channel.messages.fetch({ limit: 5 }); // 直近5件取得
    const targetMessages = prevMessages.filter(
      (msg) =>
        msg.content.startsWith('# 📆 本日') &&
        msg.author.id === client.user?.id,
    );
    for (const [_id, message] of targetMessages) {
      await message.delete();
      logger.info(
        `前回の本日のイベント予定メッセージを削除しました: ${message.id}`,
      );
    }

    // アナウンスチャンネルでイベントを表示
    const mmdd = new Date().toLocaleDateString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    });
    // メッセージを生成
    const eventListText = `- ${scheduledEvent.scheduledStartAt?.toLocaleTimeString(
      'ja-JP',
      {
        hour: '2-digit',
        minute: '2-digit',
      },
    )} [${scheduledEvent.name}](${scheduledEvent.url})${event.host ? ` (主催者: <@${event.host.userId}>)` : ''}`;
    const messageText = `# 📆 本日 ${mmdd} のイベント予定！
${eventListText}
かめぱわぁ～るどでは毎日夜9時にボイスチャンネルにてイベントを開催しています！ 🏁
新規の方も大歓迎です！だれでも参加できるので、ぜひ遊びに来てください！ ✨
`;

    // メッセージを送信
    const sentMessage = await channel.send({
      content: messageText,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          addRoleButtonAction.create(),
        ),
      ],
    });

    // メッセージを公開
    await sentMessage?.crosspost().catch((e) => {
      // エラーが発生した場合はログを出力して続行
      logger.error('メッセージの公開に失敗しました。', e);
    });

    return sentMessage;
  }
}

export default new EventOpTodayCommand(eventOpCommand);
