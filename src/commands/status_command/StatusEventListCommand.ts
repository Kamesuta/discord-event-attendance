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
import splitStrings from '../../event/splitStrings.js';
import countBy from 'lodash/countBy';

/**
 * イベントの取得条件
 */
export const eventInclude = {
  include: {
    stats: {
      where: {
        show: true,
      },
    },
    games: true,
  },
};
/**
 * イベントの取得結果
 */
export type EventDetail = Prisma.EventGetPayload<typeof eventInclude>;

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

    // 検索条件 (空白でAND検索、「 OR 」でOR検索)
    const search = interaction.options.getString('search');
    // 「 OR 」で分割
    const orTerms = search ? search.split(' OR ') : [];
    const nameCondition: Prisma.EventWhereInput = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      OR:
        orTerms.length > 0
          ? orTerms.map((orTerm) => {
              const andTerms = orTerm.split(' ');
              return {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                AND: andTerms.map((andTerm) => {
                  return {
                    name: {
                      contains: andTerm,
                    },
                  };
                }),
              };
            })
          : undefined,
    };

    // イベントを取得
    const events: EventDetail[] = await this.getEvents({
      active: GuildScheduledEventStatus.Completed,
      startTime,
      ...nameCondition,
    });

    // イベント一覧のテキストを取得
    const eventList = this.getEventListText(events);
    const userList = this.getUserListText(events);
    const hostList = this.getHostListText(events);

    // n文字以上の場合は切り捨てる
    const truncateText = (
      lines: string[],
      maxLength: number,
    ): string | undefined => {
      const truncatedText =
        '\n～以下略～ (表示するためには検索条件を絞ってください)';
      const [text, more] = splitStrings(
        lines,
        maxLength - truncatedText.length,
      );
      if (text && more) {
        return `${text}${truncatedText}`;
      }
      return text;
    };
    const truncated = truncateText(eventList, 2000);

    // 条件テキスト
    const conditionText = [];
    conditionText.push(`${eventList.length}件`);
    conditionText.push(periodText);
    if (search) {
      conditionText.push(`🔍️「${search}」`);
    }

    // Embed作成
    const embeds = new EmbedBuilder()
      .setTitle(`イベント一覧 (${conditionText.join(', ')})`)
      .setDescription(truncated || 'イベントがありません')
      .setColor('#ff8c00')
      .addFields({
        name: '参加回数 (上記イベント内合計)',
        value: truncateText(userList, 1024) || '参加者がいません',
        inline: true,
      })
      .addFields({
        name: '主催者一覧 (上記イベント内合計)',
        value: truncateText(hostList, 1024) || '主催者がいません',
        inline: true,
      })
      .setFooter({
        text: '/status event <イベントID> で詳細を確認できます',
      });

    await interaction.editReply({
      embeds: [embeds],
    });
  }

  /**
   * イベントを取得
   * @param where 取得条件
   * @returns イベント一覧
   */
  async getEvents(where: Prisma.EventWhereInput): Promise<EventDetail[]> {
    return await prisma.event.findMany({
      where,
      orderBy: [
        {
          startTime: 'asc',
        },
        {
          scheduleTime: 'desc',
        },
      ],
      ...eventInclude,
    });
  }

  /**
   * イベント一覧のテキストを取得
   * @param events イベント一覧
   * @returns イベント一覧のテキスト
   */
  getEventListText(events: EventDetail[]): string[] {
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

  /**
   * イベントに参加したユーザーと参加回数一覧のテキストを取得
   * @param events イベント一覧
   * @returns イベントに参加したユーザーと参加回数一覧のテキスト
   */
  getUserListText(events: EventDetail[]): string[] {
    // すべてのイベント内に含まれるユーザーIDのリスト
    const userList = events
      .flatMap((event) => event.stats)
      .map((stat) => stat.userId);
    // 重複をカウントしてユーザーIDと参加回数のリストを作成
    const userCount = countBy(userList);

    // ソート後、テキストに変換
    const userListText = Object.entries(userCount)
      .sort((a, b) => b[1] - a[1])
      .map(([userId, count]) => {
        return `<@${userId}> ${count}回`;
      });

    return userListText;
  }

  /**
   * イベントを主催したユーザーと主催回数一覧のテキストを取得
   * @param events イベント一覧
   * @returns イベントを主催したユーザーと主催回数一覧のテキスト
   */
  getHostListText(events: EventDetail[]): string[] {
    // すべてのイベント内に含まれる主催者IDのリスト
    const hostList = events.map((event) => event.hostId);
    // 重複をカウントしてユーザーIDと主催回数のリストを作成
    const hostCount = countBy(hostList);

    // ソート後、テキストに変換
    const hostListText = Object.entries(hostCount)
      .sort((a, b) => b[1] - a[1])
      .map(([userId, count]) => {
        return `<@${userId}> ${count}回`;
      });

    return hostListText;
  }
}

export default new StatusEventListCommand(statusCommand);
