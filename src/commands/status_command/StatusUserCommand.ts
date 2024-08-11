import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildScheduledEventStatus,
  RepliableInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import statusCommand from './StatusCommand.js';
import splitStrings from '../../event/splitStrings.js';
import { prisma } from '../../index.js';

class StatusUserCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('user')
    .setDescription('ユーザーの過去のイベント参加状況を確認')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('イベント参加状況を確認するユーザー')
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName('show')
        .setDescription(
          'コマンドの結果をチャットに表示しますか？ (デフォルトは非公開)',
        )
        .setRequired(false),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // ユーザーの過去のイベント参加状況を表示
    const show = interaction.options.getBoolean('show') ?? false;
    await interaction.deferReply({ ephemeral: !show });
    const user = interaction.options.getUser('user') ?? interaction.user;
    await this.showUserStatus(interaction, user.id);
  }

  /**
   * ユーザーの過去のイベント参加状況を表示
   * @param interaction インタラクション
   * @param userId ユーザーID
   */
  async showUserStatus(
    interaction: RepliableInteraction,
    userId: string,
  ): Promise<void> {
    // ユーザーの過去のイベント参加状況を表示
    const events = await prisma.event.findMany({
      where: {
        active: GuildScheduledEventStatus.Completed,
        stats: {
          some: {
            userId,
            show: true,
          },
        },
      },
      include: {
        stats: true,
        games: true,
      },
      orderBy: {
        startTime: 'desc',
      },
    });

    // 全イベント数を取得
    const eventCount = await prisma.event.count({
      where: {
        endTime: {
          not: null,
        },
      },
    });

    // ユーザーを取得
    const user = await interaction.guild?.members.fetch(userId);

    const embeds = new EmbedBuilder()
      .setTitle('イベント参加状況')
      .setDescription(`<@${userId}> さんの過去のイベント参加状況です`)
      .setAuthor(
        !user
          ? null
          : {
              name: user.displayName,
              iconURL: user.displayAvatarURL() ?? undefined,
            },
      )
      .setColor('#ff8c00')
      .addFields({
        name: '参加イベント数',
        value: `${events.length} / ${eventCount} 回`,
      });

    splitStrings(
      events.map((event) => {
        if (!event) return '- 不明';
        const date = !event.startTime
          ? '未定'
          : `<t:${Math.floor(event.startTime.getTime() / 1000)}>`;
        return `- [${event.id.toString().padStart(3, ' ')}]　${date}　${event.name}　(${event.stats.length}人, ${event.games.length}試合)`;
      }),
      1024,
    ).forEach((line, i) => {
      embeds.addFields({
        name: i === 0 ? '参加イベントリスト' : '\u200b',
        value: line,
      });
    });

    await interaction.editReply({
      embeds: [embeds],
    });
  }
}

export default new StatusUserCommand(statusCommand);
