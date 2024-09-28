import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildScheduledEventStatus,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import statusCommand from './StatusCommand.js';
import { prisma } from '../../index.js';
import { Prisma } from '@prisma/client';

class StatusEventListCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('event_list')
    .setDescription('イベントの一覧を確認')
    .addBooleanOption((option) =>
      option
        .setName('show')
        .setDescription(
          'コマンドの結果をチャットに表示しますか？ (デフォルトは非公開)',
        )
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('period')
        .setDescription(
          '表示する月 (ハイフンで範囲指定可: 「3-5」 = 3月〜5月、スラッシュで年/日指定可: 「2023/3」 = 2023年3月, 「8/5」 = 今年の8月5日)',
        )
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('search')
        .setDescription('イベント名で検索')
        .setRequired(false),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベントの出欠状況を表示
    const show = interaction.options.getBoolean('show') ?? false;
    await interaction.deferReply({ ephemeral: !show });

    // 期間指定
    const currentYear = new Date().getFullYear();
    const periodOption = interaction.options.getString('period');
    let startTime: { gte: Date; lt: Date } | undefined;

    // 期間指定がある場合
    if (periodOption) {
      const [start, end] = periodOption.split('-').map((part) => {
        // 「2024/3/5」→{ year: 2024, month: 3, date: 5 }
        // 「2024/3」→{ year: 2024, month: 3, date: undefined } (4桁の場合は年指定)
        // 「8/5」→{ year: currentYear, month: 8, date: 5 }
        // 「3」→{ year: currentYear, month: 3, date: undefined }
        // 「2024」→{ year: 2024, month: undefined, date: undefined }
        const split = part.split('/').map((v) => parseInt(v, 10));

        if (split.length === 3) {
          // 「2024/3/5」→{ year: 2024, month: 3, date: 5 }
          return { year: split[0], month: split[1], date: split[2] };
        } else if (split.length === 2) {
          if (split[0] > 999) {
            // 「2024/3」→{ year: 2024, month: 3, date: undefined }
            return { year: split[0], month: split[1], date: undefined };
          } else {
            // 「8/5」→{ year: currentYear, month: 8, date: 5 }
            return {
              year: currentYear,
              month: split[0],
              date: split[1],
            };
          }
        } else if (split.length === 1) {
          if (split[0] > 999) {
            // 「2024」→{ year: 2024, month: undefined, date: undefined }
            return { year: split[0], month: undefined, date: undefined };
          } else {
            // 「3」→{ year: currentYear, month: 3, date: undefined }
            return {
              year: currentYear,
              month: split[0],
              date: undefined,
            };
          }
        } else {
          // 不正な入力の場合、undefinedを返す
          return undefined;
        }
      });

      if (!start) {
        // 不正な入力の場合、全期間とする
        startTime = undefined;
      } else if (!end) {
        // 単一指定
        if (!start.month) {
          // 年指定
          startTime = {
            gte: new Date(start.year, 0, 1), // 年初め
            lt: new Date(start.year + 1, 0, 1), // 翌年初め
          };
        } else if (!start.date) {
          // 月指定
          startTime = {
            gte: new Date(start.year, start.month - 1, 1), // 月初め
            lt: new Date(start.year, start.month, 1), // 翌月初め
          };
        } else {
          // 日指定
          startTime = {
            gte: new Date(start.year, start.month - 1, start.date), // 日初め
            lt: new Date(start.year, start.month - 1, start.date + 1), // 翌日初め
          };
        }
      } else {
        // 範囲指定
        let gte, lt: Date | undefined;
        if (!start.month) {
          // 年指定
          gte = new Date(start.year, 0, 1); // 年初め
        } else if (!start.date) {
          // 月指定
          gte = new Date(start.year, start.month - 1, 1); // 月初め
        } else {
          // 日指定
          gte = new Date(start.year, start.month - 1, start.date); // 日初め
        }
        if (!end.month) {
          // 年指定
          lt = new Date(end.year + 1, 0, 1); // 翌年初め
        } else if (!end.date) {
          // 月指定
          lt = new Date(end.year, end.month, 1); // 翌月初め
        } else {
          // 日指定
          lt = new Date(end.year, end.month - 1, end.date); // 翌日初め
        }
        startTime = {
          gte,
          lt,
        };
      }
    }

    // 期間テキスト
    const periodText = startTime
      ? `<t:${Math.floor(startTime.gte.getTime() / 1000)}:D> 〜 <t:${Math.floor(startTime.lt.getTime() / 1000)}:D>`
      : '全期間';

    // 検索条件
    const search = interaction.options.getString('search');
    const name: Prisma.EventWhereInput['name'] = search
      ? {
          contains: search,
        }
      : undefined;

    // イベント一覧のテキストを取得
    const eventList = await this.getEventListText({
      active: GuildScheduledEventStatus.Completed,
      startTime,
      name,
    });

    // Embed作成
    const embeds = new EmbedBuilder()
      .setTitle(`イベント一覧 (${periodText}, ${eventList.length}件)`)
      .setDescription(eventList.join('\n') || 'イベントがありません')
      .setColor('#ff8c00')
      .setFooter({
        text: '/status event <イベントID> で詳細を確認できます',
      });

    await interaction.editReply({
      embeds: [embeds],
    });
  }

  /**
   * イベント一覧のテキストを取得
   * @param where イベントの検索条件
   * @returns イベント一覧のテキスト
   */
  async getEventListText(where: Prisma.EventWhereInput): Promise<string[]> {
    // イベントを取得
    const events = await prisma.event.findMany({
      where,
      orderBy: [
        {
          startTime: 'asc',
        },
        {
          scheduleTime: 'desc',
        },
      ],
      include: {
        stats: {
          where: {
            show: true,
          },
        },
        games: true,
      },
    });

    // [${イベントID(3桁空白埋め)}] <t:${開始日時}:> イベント名 (${参加者数}人, ${試合数}試合)
    const eventList = events.map((event) => {
      const date = !event.startTime
        ? '未定'
        : `<t:${Math.floor(event.startTime.getTime() / 1000)}>`;
      const host = event.hostId ? `<@${event.hostId}>主催` : '主催者未定';
      return `- [${event.id.toString().padStart(3, ' ')}]　${date}　${event.name}　(${event.stats.length}人, ${event.games.length}試合, ${host})`;
    });

    return eventList;
  }
}

export default new StatusEventListCommand(statusCommand);
