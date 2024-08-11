import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildScheduledEventStatus,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import statusCommand from './StatusCommand.js';
import { prisma } from '../../index.js';

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
    .addIntegerOption((option) =>
      option
        .setName('month')
        .setDescription('表示する月 (デフォルトは全期間を表示します)')
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
      : undefined;
    const piriodText = month
      ? `${month}月`
      : `全期間 (～<t:${new Date().getTime() / 1000}:D>)`;

    // イベントを取得
    const hostList = await prisma.event.groupBy({
      by: ['hostId'],
      where: {
        active: GuildScheduledEventStatus.Completed,
        startTime,
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
      .setTitle(`主催者一覧 (${piriodText}, ${hostList.length}人)`)
      .setDescription(eventList.join('\n') || '主催者がいません')
      .setColor('#ff8c00');

    await interaction.editReply({
      embeds: [embeds],
    });
  }
}

export default new StatusHostListCommand(statusCommand);
