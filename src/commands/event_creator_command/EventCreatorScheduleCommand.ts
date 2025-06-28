import {
  ChatInputCommandInteraction,
  GuildScheduledEventStatus,
  SlashCommandSubcommandBuilder,
  MessageFlags,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import { config } from '../../utils/config.js';
import { prisma } from '../../index.js';
import eventCreatorCommand from './EventCreatorCommand.js';
import { eventIncludeHost, EventWithHost } from '../../event/EventManager.js';
import { logger } from '../../utils/log.js';
import calendarMessageUpdater from './schedule/CalendarMessageUpdater.js';
import detailMessageUpdater from './schedule/DetailMessageUpdater.js';
class EventCreatorScheduleCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('schedule')
    .setDescription('1週間分のスケジュールメッセージを作成します');

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベントを開始
    await interaction.deferReply({ ephemeral: true });

    // イベント予定チャンネルを取得
    const scheduleChannel = await interaction.guild?.channels.fetch(
      config.schedule_channel_id,
    );
    if (!scheduleChannel?.isTextBased()) {
      await interaction.editReply(
        'イベント予定チャンネルが見つかりませんでした。',
      );
      return;
    }

    // 期間を計算 (水曜日で次の週になるようにする)
    // 現在:11/19(火) → 11/17(日)～11/23(土)
    // 現在:11/20(水) → 11/24(日)～11/30(土)
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - now.getDay() + 7);
    start.setHours(0, 0, 0, 0);
    if (now.getDay() < 3 /* 水曜 */) {
      start.setDate(start.getDate() - 7);
    }
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    // イベントを取得
    const events: EventWithHost[] = await prisma.event.findMany({
      where: {
        active: {
          not: GuildScheduledEventStatus.Canceled,
        },
        scheduleTime: {
          gte: start,
          lt: end,
        },
      },
      orderBy: [
        {
          scheduleTime: 'asc',
        },
      ],
      ...eventIncludeHost,
    });

    // 古いメッセージを削除
    const messages = await scheduleChannel.messages.fetch({ limit: 100 });
    const oldMessages = messages.filter((msg) => {
      return (
        msg.author.id === interaction.client.user.id &&
        msg.content.startsWith('## 📆 ')
      );
    });

    // 1個だけ削除
    if (oldMessages.size > 0) {
      const oldestMessage = oldMessages.first();
      if (oldestMessage) {
        await oldestMessage.delete();
      }
    }

    // カレンダーメッセージを送信
    const calendarText = calendarMessageUpdater.createCalendarText(events);
    await scheduleChannel.send(calendarText);

    // 詳細メッセージを送信
    const { components, attachments } =
      await detailMessageUpdater.createDetailComponents(events, start, end);
    const detailMessage = await scheduleChannel.send({
      components: components,
      files: attachments,
      flags: MessageFlags.IsComponentsV2,
    });

    // メッセージを公開
    await detailMessage?.crosspost().catch((e) => {
      // エラーが発生した場合はログを出力して続行
      logger.error('メッセージの公開に失敗しました。', e);
    });

    // 成功メッセージを返信
    await interaction.editReply('イベント予定を投稿しました！');
  }
}

export default new EventCreatorScheduleCommand(eventCreatorCommand);
