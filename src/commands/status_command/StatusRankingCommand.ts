import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildScheduledEventStatus,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import statusCommand from './StatusCommand.js';
import { prisma } from '../../utils/prisma.js';
import { parsePeriod, Period } from '../../utils/parsers/periodParser.js';
import { parseSearch } from '../../utils/parsers/searchParser.js';
import { Prisma } from '@prisma/client';
import groupBy from 'lodash/groupBy.js';
import splitStrings from '../../utils/string/splitStrings.js';

class StatusRankingCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('ranking')
    .setDescription('イベント参加率ランキングを確認')
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('ランキングの種類')
        .addChoices([
          { name: '参加回数', value: 'join' },
          { name: '主催回数', value: 'host' },
          { name: '試合のXP合計', value: 'xp' },
          { name: '主催者ごとのイベント参加人数', value: 'host_join' },
        ])
        .setRequired(true),
    )
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
    .addIntegerOption((option) =>
      option
        .setName('max_count')
        .setDescription(
          '表示するユーザー数 (デフォルトはトップ20, 0で全員表示)',
        )
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

    // 統計をとる対象
    const type = interaction.options.getString('type');

    // 期間指定
    const periodOption = interaction.options.getString('period');
    const period = parsePeriod(periodOption ?? undefined);

    // 検索条件
    const search = interaction.options.getString('search');
    const nameCondition = parseSearch(search ?? undefined);

    // - <@ユーザーID> (◯回)
    let userList: string[] = [];
    let typeText = '不明なランキング';
    switch (type) {
      case 'join':
        userList = await this._getJoinRanking(period, nameCondition);
        typeText = '参加回数ランキング';
        break;
      case 'host':
        userList = await this._getHostRanking(period, nameCondition);
        typeText = '主催回数ランキング';
        break;
      case 'xp':
        userList = await this._getXpRanking(period, nameCondition);
        typeText = '試合のXP合計ランキング';
        break;
      case 'host_join':
        userList = await this._getHostJoinRanking(period, nameCondition);
        typeText = '主催者ごとのイベント参加人数ランキング';
        break;
    }

    // 表示数
    const maxCount = interaction.options.getInteger('max_count') ?? 20;
    const maxCountText = maxCount ? `トップ${maxCount}/` : '';
    // マッチ数
    const numMatch = userList.length;
    // 表示数が指定されている場合は切り捨て
    if (maxCount) {
      userList = userList.slice(0, maxCount);
    }

    // 全イベント数を取得
    const allEventCount = await prisma.event.count({
      where: {
        startTime: period.period,
        active: GuildScheduledEventStatus.Completed,
        ...nameCondition,
      },
    });

    // 全イベントのべ参加者数を取得
    const allUserCount = await prisma.userStat.count({
      where: {
        event: {
          startTime: period.period,
          active: GuildScheduledEventStatus.Completed,
          ...nameCondition,
        },
        show: true,
      },
    });

    // 一旦フィールドを配列に入れ、ページング処理を行う
    const chunks = splitStrings(userList, 4096);
    const page = interaction.options.getInteger('page') ?? 1;
    const pageText =
      chunks.length > 1
        ? `ページ ${page}/${chunks.length}\n/status ranking ～ page:${page + 1} で次のページを表示\n`
        : '';

    // 条件テキスト
    const conditionText = [];
    conditionText.push(`${maxCountText}参加者数${numMatch}人`);
    conditionText.push(period.text);
    conditionText.push(`全${allEventCount}イベント`);
    conditionText.push(`のべ${allUserCount}人の参加者`);
    if (search) {
      // searchが128文字以上は...で省略
      const searchDisplay =
        search.length > 128 ? `${search.slice(0, 128)}...` : search;
      conditionText.push(`🔍️「${searchDisplay}」`);
    }

    // Embed作成
    const embeds = new EmbedBuilder()
      .setTitle(`${typeText} (${conditionText.join(', ')})`)
      .setDescription(chunks[page - 1] ?? 'イベントがありません')
      .setColor('#ff8c00')
      .setFooter({
        text: `${pageText}/status user <ユーザーID> で詳細を確認できます`,
      });

    await interaction.editReply({
      embeds: [embeds],
    });
  }

  /**
   * 参加回数ランキングを取得
   * @param period 期間
   * @param nameCondition イベント名条件
   * @returns ランキング
   */
  private async _getJoinRanking(
    period: Period,
    nameCondition: Prisma.EventWhereInput,
  ): Promise<string[]> {
    // ランキングを集計
    const ranking = await prisma.userStat.groupBy({
      by: ['userId'],
      where: {
        show: true,
        event: {
          startTime: period.period,
          active: GuildScheduledEventStatus.Completed,
          ...nameCondition,
        },
      },
      // eslint-disable-next-line @typescript-eslint/naming-convention
      _count: true,
    });
    // ユーザーIDを取得
    const userIds = ranking.map((event) => event.userId);
    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds },
      },
    });
    // ランキング+Userを結合
    const rankingWithUser = ranking.map((stat) => {
      const user = users.find((user) => user.id === stat.userId);
      return { ...stat, user };
    });
    // ランキングを表示形式に変換
    return rankingWithUser
      .sort((a, b) => b._count - a._count)
      .map((stat) => {
        const userId = stat.user?.userId;
        const count = stat._count;
        return `<@${userId}>: ${count}回`;
      });
  }

  /**
   * 主催回数ランキングを取得
   * @param period 期間
   * @param nameCondition イベント名条件
   * @returns ランキング
   */
  private async _getHostRanking(
    period: Period,
    nameCondition: Prisma.EventWhereInput,
  ): Promise<string[]> {
    const events = await prisma.event.findMany({
      where: {
        active: GuildScheduledEventStatus.Completed,
        startTime: period.period,
        ...nameCondition,
      },
      include: {
        host: {
          select: {
            userId: true,
          },
        },
      },
    });

    // ホストごとのイベント数を集計
    const hostCounts = events.reduce(
      (acc, event) => {
        if (!event.hostId || !event.host) return acc;
        const userId = event.host.userId;
        acc[userId] = (acc[userId] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // ランキングを作成
    return Object.entries(hostCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([userId, count]) => {
        return `<@${userId}>: ${count}回主催`;
      });
  }

  /**
   * XP合計ランキングを取得
   * @param period 期間
   * @param nameCondition イベント名条件
   * @returns ランキング
   */
  private async _getXpRanking(
    period: Period,
    nameCondition: Prisma.EventWhereInput,
  ): Promise<string[]> {
    // ランキングを集計
    const ranking = await prisma.userGameResult.groupBy({
      by: ['userId'],
      where: {
        event: {
          startTime: period.period,
          active: GuildScheduledEventStatus.Completed,
          ...nameCondition,
        },
      },
      // eslint-disable-next-line @typescript-eslint/naming-convention
      _sum: {
        xp: true,
      },
    });
    return ranking
      .filter((event) => event._sum.xp)
      .sort((a, b) => b._sum.xp! - a._sum.xp!)
      .map(({ userId, _sum }) => {
        return `<@${userId}>: ${_sum.xp}XP`;
      });
  }

  /**
   * 主催者ごとの参加人数ランキングを取得
   * @param period 期間
   * @param nameCondition イベント名条件
   * @returns ランキング
   */
  private async _getHostJoinRanking(
    period: Period,
    nameCondition: Prisma.EventWhereInput,
  ): Promise<string[]> {
    // ランキングを集計
    const ranking = await prisma.event.findMany({
      where: {
        active: GuildScheduledEventStatus.Completed,
        startTime: period.period,
        ...nameCondition,
      },
      include: {
        stats: {
          where: {
            show: true,
          },
        },
      },
    });
    const rankingByHost = groupBy(ranking, 'hostId');

    // 最大参加人数を取得
    const maxJoinCount = ranking.reduce((max, event) => {
      return Math.max(max, event.stats.length);
    }, 0);

    // 中央値を求める関数
    const median = (arr: number[]): number => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    // 主催者ごとに、平均のイベント参加率を計算
    const hostJoin = Object.entries(rankingByHost).map(([hostId, events]) => {
      const joinCountArray = events.map((event) => event.stats.length);
      const average =
        joinCountArray.reduce((sum, count) => sum + count, 0) /
        joinCountArray.length;
      const med = median(joinCountArray);
      return {
        hostId,
        average,
        median: med,
        eventCount: events.length,
        joinCountArray,
      };
    });

    // バーの長さ
    const barLength = 16;
    // 最低主催回数
    const minHostCount = 3;
    // 主催回数が3回未満のユーザーは最後尾に移動
    const valuation = (data: { eventCount: number; average: number }): number =>
      (minHostCount < data.eventCount ? maxJoinCount : 0) + data.average;

    return hostJoin
      .sort((a, b) => valuation(b) - valuation(a))
      .map(({ hostId, average, median, eventCount, joinCountArray }) => {
        // 0～maxJoinCount の範囲をbarLength個の範囲に分割し、配列に格納
        const splitVolume = Array.from(
          { length: barLength },
          (_, i) =>
            joinCountArray.filter(
              (count) => Math.floor((count / maxJoinCount) * barLength) === i,
            ).length,
        );

        // 分布図を作成 (イベント回数の割合を ▁▂▃▄▅▆▇█ を使って分布図にする)
        const volumeType = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
        const volume = splitVolume
          .map((count) => volumeType[Math.min(count, volumeType.length - 1)])
          .join('');
        return `${eventCount}回開催, 中央値${median}人, 平均${average.toFixed(2)}人 <@${hostId}>\n${volume}`;
      });
  }
}

export default new StatusRankingCommand(statusCommand);
