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

class StatusHostListCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('host_list')
    .setDescription('主催者の一覧を確認')
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
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベントの出欠状況を表示
    const show = interaction.options.getBoolean('show') ?? false;
    await interaction.deferReply({ ephemeral: !show });

    // 期間指定
    const periodOption = interaction.options.getString('period');
    const period = parsePeriod(periodOption ?? undefined);

    // イベントを取得
    const hostList = await prisma.event.groupBy({
      by: ['hostId'],
      where: {
        active: GuildScheduledEventStatus.Completed,
        startTime: period.period,
      },
      // eslint-disable-next-line @typescript-eslint/naming-convention
      _count: true,
    });

    const eventList = hostList
      .sort((a, b) => b._count - a._count)
      .flatMap((hostCount) => {
        const hostId = hostCount.hostId;
        if (!hostId) return []; // 主催者がいない場合は表示しない
        const count = hostCount._count;
        return `<@${hostId}>: ${count}回主催`;
      });

    // Embed作成
    const embeds = new EmbedBuilder()
      .setTitle(`主催者一覧 (${hostList.length}人, ${period.text})`)
      .setDescription(eventList.join('\n') || '主催者がいません')
      .setColor('#ff8c00');

    await interaction.editReply({
      embeds: [embeds],
    });
  }
}

export default new StatusHostListCommand(statusCommand);
