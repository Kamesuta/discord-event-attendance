import {
  ChatInputCommandInteraction,
  GuildScheduledEventStatus,
  SlashCommandSubcommandBuilder,
  MessageFlags,
} from 'discord.js';
import { SubcommandInteraction } from '@/commands/base/commandBase';
import { config } from '@/bot/config';
import { prisma } from '@/utils/prisma';
import { eventCreatorCommand } from './EventCreatorCommand';
import { eventIncludeHost, EventWithHost } from '@/domain/queries/eventQueries';
import { logger } from '@/utils/log';
import { calendarMessageUpdater } from '@/messageUpdaters/CalendarMessageUpdater';
import { detailMessageUpdater } from '@/messageUpdaters/DetailMessageUpdater';
import { parseDate } from '@/domain/parsers/periodParser';
import { eventCreatorPreparationPanelCommand } from './EventCreatorPreparationPanelCommand';

class EventCreatorScheduleCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('schedule')
    .setDescription('1週間分のスケジュールメッセージを作成します')
    .addStringOption((option) =>
      option
        .setName('date')
        .setDescription('基準日 (YYYY/MM/DD形式、指定がなければ今日)'),
    )
    .addBooleanOption((option) =>
      option
        .setName('show')
        .setDescription(
          '他の人にも見えるメッセージにしますか？ (デフォルト: 公開)',
        ),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const show = interaction.options.getBoolean('show') ?? true;
    await interaction.deferReply({ ephemeral: true });

    const dateString = interaction.options.getString('date');
    const now = dateString ? parseDate(dateString) : new Date();

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

    // カレンダーメッセージを作成
    const calendarText = calendarMessageUpdater.createCalendarText(
      events,
      start,
      end,
    );

    // 詳細メッセージを作成
    const { components, attachments } =
      await detailMessageUpdater.createDetailComponents(events, start, end);

    if (show) {
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

      await scheduleChannel.send({
        content: calendarText,
        flags: MessageFlags.SuppressEmbeds,
      });
      const detailMessage = await scheduleChannel.send({
        components: components,
        files: attachments,
        flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressEmbeds,
      });

      // 準備状況パネルを投稿（独立コマンド経由）
      await eventCreatorPreparationPanelCommand.outputPanel(interaction, true);

      // メッセージを公開
      await detailMessage?.crosspost().catch((e) => {
        // エラーが発生した場合はログを出力して続行
        logger.error(
          'メッセージの公開に失敗しました。しかし、処理は続行します。',
          e,
        );
      });
      await interaction.editReply(
        'イベント予定と準備状況パネルを投稿しました！',
      );
    } else {
      await interaction.followUp({
        content: calendarText,
        flags: MessageFlags.SuppressEmbeds | MessageFlags.Ephemeral,
      });
      await interaction.followUp({
        components: components,
        files: attachments,
        flags:
          MessageFlags.IsComponentsV2 |
          MessageFlags.SuppressEmbeds |
          MessageFlags.Ephemeral,
      });
      // 準備状況パネルをプレビュー（独立コマンド経由）
      await eventCreatorPreparationPanelCommand.outputPanel(interaction, false);
    }
  }
}

/**
 * EventCreatorScheduleCommandのインスタンス
 */
export const eventCreatorScheduleCommand = new EventCreatorScheduleCommand(
  eventCreatorCommand,
);
