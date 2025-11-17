import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildScheduledEventStatus,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import { statusCommand } from './StatusCommand.js';
import { prisma } from '../../utils/prisma.js';
import { Prisma } from '@prisma/client';
import { splitStrings } from '../../utils/string/splitStrings.js';
import { parsePeriod } from '../../utils/parsers/periodParser.js';
import { parseSearch } from '../../utils/parsers/searchParser.js';
import { eventIncludeHost } from '../../domain/queries/eventQueries.js';

/**
 * イベントの取得条件
 */
export const eventIncludeDetail = {
  include: {
    stats: {
      where: {
        show: true,
      },
    },
    games: true,
    ...eventIncludeHost.include,
  },
};
/**
 * イベントの取得結果
 */
export type EventDetail = Prisma.EventGetPayload<typeof eventIncludeDetail>;

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
    )
    .addStringOption((option) =>
      option
        .setName('sort')
        .setDescription('ソート順 (デフォルトは参加者数)')
        .addChoices([
          { name: '参加者数', value: 'join' },
          { name: '開始日時', value: 'startTime' },
          { name: 'ID', value: 'id' },
        ])
        .setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName('page')
        .setDescription('ページ番号')
        .setRequired(false)
        .setMinValue(1),
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

    // ソート順
    const sort = interaction.options.getString('sort') ?? 'join';
    let sortText = '不明順';
    switch (sort) {
      case 'join':
        sortText = '人気イベント順';
        break;
      case 'startTime':
        sortText = '開始時間順';
        break;
      case 'id':
        sortText = 'ID順';
        break;
    }

    // イベントを取得
    const events: EventDetail[] = await this.getEvents(
      {
        active: GuildScheduledEventStatus.Completed,
        startTime: period.period,
        ...nameCondition,
      },
      sort,
    );

    // イベント一覧のテキストを取得
    const eventList = this.getEventListText(events);

    // 一旦フィールドを配列に入れ、ページング処理を行う
    const chunks = splitStrings(eventList, 4096);
    const page = interaction.options.getInteger('page') ?? 1;
    const pageText =
      chunks.length > 1
        ? `ページ ${page}/${chunks.length}\n/status ranking ～ page:${page + 1} で次のページを表示\n`
        : '';

    // 条件テキスト
    const conditionText = [];
    conditionText.push(`イベント数${eventList.length}件`);
    conditionText.push(sortText);
    conditionText.push(period.text);
    if (search) {
      // searchが128文字以上は...で省略
      const searchDisplay =
        search.length > 128 ? `${search.slice(0, 128)}...` : search;
      conditionText.push(`🔍️「${searchDisplay}」`);
    }

    // Embed作成
    const embeds = new EmbedBuilder()
      .setTitle(`イベント一覧 (${conditionText.join(', ')})`)
      .setDescription(chunks[page - 1] ?? 'イベントがありません')
      .setColor('#ff8c00')
      .setFooter({
        text: `${pageText}/status event <イベントID> で詳細を確認できます`,
      });

    await interaction.editReply({
      embeds: [embeds],
    });
  }

  /**
   * イベントを取得
   * @param where 取得条件
   * @param sort ソート順
   * @returns イベント一覧
   */
  async getEvents(
    where: Prisma.EventWhereInput,
    sort: string = 'join',
  ): Promise<EventDetail[]> {
    const result = await prisma.event.findMany({
      where,
      orderBy: [
        {
          startTime: 'asc',
        },
        {
          scheduleTime: 'desc',
        },
      ],
      ...eventIncludeDetail,
    });

    // ソート
    switch (sort) {
      case 'join':
        result.sort((a, b) => b.stats.length - a.stats.length);
        break;
      case 'startTime':
        result.sort((a, b) => {
          if (!a.startTime && !b.startTime) return 0;
          if (!a.startTime) return 1;
          if (!b.startTime) return -1;
          return a.startTime.getTime() - b.startTime.getTime();
        });
        break;
      case 'id':
        result.sort((a, b) => a.id - b.id);
        break;
    }

    return result;
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
      const host = event.host?.userId
        ? `<@${event.host.userId}>主催`
        : '主催者未定';
      return `- [${event.id.toString().padStart(3, ' ')}]　${date}　${event.name}　(${event.stats.length}人, ${event.games.length}試合, ${host})`;
    });

    return eventList;
  }
}

/**
 * StatusEventListCommandのインスタンス
 */
export const statusEventListCommand = new StatusEventListCommand(statusCommand);
