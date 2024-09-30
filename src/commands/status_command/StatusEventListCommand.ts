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
import { parsePeriod } from '../../event/periodParser.js';
import { parseSearch } from '../../event/searchParser.js';

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
          '表示する月 (ハイフンで範囲指定可: 「3-5」 = 3月〜5月、スラッシュで年/日指定可: 「2023/3」 = 2023年3月, 「8/5」 = 今年の8月5日、デフォルトで全期間)',
        )
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('search')
        .setDescription(
          'イベント名で検索 (空白区切りでAND検索、「 OR 」区切りでOR検索)',
        )
        .setRequired(false),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベントの出欠状況を表示
    const show = interaction.options.getBoolean('show') ?? false;
    await interaction.deferReply({ ephemeral: !show });

    // 期間指定
    const periodOption = interaction.options.getString('period');
    const period = parsePeriod(periodOption ?? undefined);

    // 検索条件
    const search = interaction.options.getString('search');
    const nameCondition = parseSearch(search ?? undefined);

    // イベントを取得
    const events: EventDetail[] = await this.getEvents({
      active: GuildScheduledEventStatus.Completed,
      startTime: period.period,
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
    conditionText.push(period.text);
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
