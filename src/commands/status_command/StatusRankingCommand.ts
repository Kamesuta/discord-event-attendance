import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildScheduledEventStatus,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import statusCommand from './StatusCommand.js';
import { prisma } from '../../index.js';

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
    .addIntegerOption((option) =>
      option
        .setName('month')
        .setDescription('表示する月 (デフォルトは直近30日間を表示します)')
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

    // 月
    const month = interaction.options.getInteger('month');
    const currentYear = new Date().getFullYear();
    const startTime = month
      ? {
          gt: new Date(currentYear, month - 1, 1), // 月初め
          lt: new Date(currentYear, month, 1), // 翌月初め
        }
      : {
          // 直近1ヶ月
          gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        };
    const piriodText = month
      ? `${month}月`
      : `直近30日間 (<t:${Math.floor(startTime.gt.getTime() / 1000)}:D> 〜 <t:${Math.floor(startTime.lt?.getTime() ?? Date.now() / 1000)}:D>)`;

    // 表示数
    const maxCount = interaction.options.getInteger('max_count') ?? 20;
    const maxCountText = maxCount ? `トップ${maxCount}/` : '';

    // 参加率ランキングを集計
    const ranking = await prisma.userStat.groupBy({
      by: ['userId'],
      where: {
        show: true,
        event: {
          startTime,
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
        startTime,
        active: GuildScheduledEventStatus.Completed,
      },
    });

    // Embed作成
    const embeds = new EmbedBuilder()
      .setTitle(
        `参加率ランキング (${piriodText}, ${maxCountText}全${ranking.length}件, 全${allEventCount}イベント)`,
      )
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
