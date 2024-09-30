import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildScheduledEventStatus,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import statusCommand from './StatusCommand.js';
import { prisma } from '../../index.js';
import { parsePeriod } from '../../event/periodParser.js';
import { parseSearch } from '../../event/searchParser.js';

class StatusRankingCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('ranking')
    .setDescription('イベント参加率ランキングを確認')
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

    // 表示数
    const maxCount = interaction.options.getInteger('max_count') ?? 20;
    const maxCountText = maxCount ? `トップ${maxCount}/` : '';

    // 参加率ランキングを集計
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

    // - <@ユーザーID> (◯回)
    const userList = ranking
      .sort((a, b) => b._count - a._count)
      .slice(0, maxCount || ranking.length)
      .map((event) => {
        const userId = event.userId;
        const count = event._count;
        return `<@${userId}>: ${count}回`;
      });

    // 全イベント数を取得
    const allEventCount = await prisma.event.count({
      where: {
        startTime: period.period,
        active: GuildScheduledEventStatus.Completed,
        ...nameCondition,
      },
    });

    // 条件テキスト
    const conditionText = [];
    conditionText.push(`${maxCountText}全${ranking.length}件`);
    conditionText.push(period.text);
    conditionText.push(`全${allEventCount}イベント`);
    if (search) {
      conditionText.push(`🔍️「${search}」`);
    }

    // Embed作成
    const embeds = new EmbedBuilder()
      .setTitle(`参加率ランキング (${conditionText.join(', ')})`)
      .setDescription(userList.join('\n') || 'イベントがありません')
      .setColor('#ff8c00')
      .setFooter({
        text: '/status user <ユーザーID> で詳細を確認できます',
      });

    await interaction.editReply({
      embeds: [embeds],
    });
  }
}

export default new StatusRankingCommand(statusCommand);
