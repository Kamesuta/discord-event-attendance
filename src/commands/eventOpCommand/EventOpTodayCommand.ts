import {
  ChatInputCommandInteraction,
  Message,
  SlashCommandSubcommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  GuildScheduledEvent,
  GuildTextBasedChannel,
} from 'discord.js';
import { SubcommandInteraction } from '../base/commandBase.js';
import { config } from '../../bot/config.js';
import { eventManager } from '../../domain/services/EventManager.js';
import { EventWithHost } from '../../domain/queries/eventQueries.js';
import { eventOpCommand } from './EventOpCommand.js';
import { addRoleButtonAction } from '../action/AddRoleButtonAction.js';
import { logger } from '../../utils/log.js';
import { client } from '../../bot/client.js';

class EventOpTodayCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('today')
    .setDescription('本日のイベント予定を表示します');

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    // アナウンスチャンネルを取得
    const channel = interaction.guild?.channels.cache.get(
      config.schedule_channel_id,
    );
    if (!channel?.isTextBased()) {
      await interaction?.editReply({
        content: 'アナウンスチャンネルが見つかりませんでした',
      });
      return;
    }

    // 本日分の全イベントを取得
    const allEvents = await interaction.guild?.scheduledEvents.fetch();
    const today = new Date().toLocaleDateString('ja-JP');
    const todayEvents: [GuildScheduledEvent, EventWithHost][] = [];
    for (const ev of allEvents?.values() ?? []) {
      if (ev.scheduledStartAt?.toLocaleDateString('ja-JP') === today) {
        const dbEvent = await eventManager.getEventFromDiscordId(ev.id);
        if (dbEvent) {
          todayEvents.push([ev, dbEvent]);
        }
      }
    }

    // イベントをアナウンス
    const message = await this.showTodayMessage(channel, todayEvents);

    // 返信
    await interaction.editReply({
      content: `イベント予定を表示しました: ${message?.url ?? '不明'}`,
    });
  }

  /**
   * 本日のイベント予定を表示します
   * @param channel チャンネル
   * @param events その日のイベントリスト [GuildScheduledEvent, EventWithHost][]
   * @returns 送信したメッセージ
   */
  async showTodayMessage(
    channel: GuildTextBasedChannel,
    events: [GuildScheduledEvent, EventWithHost][],
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
    // イベントリストテキスト生成
    const eventListText = events
      .map(
        ([scheduledEvent, event]) =>
          `- ${scheduledEvent.scheduledStartAt?.toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
          })} [${scheduledEvent.name}](${scheduledEvent.url})${event.host ? ` (主催者: <@${event.host.userId}>)` : ''}`,
      )
      .join('\n');
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

/**
 * EventOpTodayCommandのインスタンス
 */
export const eventOpTodayCommand = new EventOpTodayCommand(eventOpCommand);
