import {
  APIEmbedField,
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
    )
    .addIntegerOption((option) =>
      option
        .setName('page')
        .setDescription('ページ番号')
        .setRequired(false)
        .setMinValue(1),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // ユーザーの過去のイベント参加状況を表示
    const show = interaction.options.getBoolean('show') ?? false;
    await interaction.deferReply({ ephemeral: !show });
    const user = interaction.options.getUser('user') ?? interaction.user;
    const page = interaction.options.getInteger('page') ?? 1;
    await this.showUserStatus(interaction, user.id, page);
  }

  /**
   * ユーザーの過去のイベント参加状況を表示
   * @param interaction インタラクション
   * @param userId ユーザーID
   * @param page ページ番号
   */
  async showUserStatus(
    interaction: RepliableInteraction,
    userId: string,
    page: number = 1,
  ): Promise<void> {
    // 主催イベント一覧を取得
    const hostEvents = await prisma.event.findMany({
      where: {
        active: GuildScheduledEventStatus.Completed,
        hostId: userId,
      },
      include: {
        stats: true,
        games: true,
      },
      orderBy: {
        startTime: 'desc',
      },
    });

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

    // 参加率ランキング順位 (直近30日間)
    const ranking = await prisma.userStat.groupBy({
      by: ['userId'],
      where: {
        show: true,
        event: {
          startTime: {
            gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      },
      // eslint-disable-next-line @typescript-eslint/naming-convention
      _count: true,
    });
    const rank =
      ranking
        .sort((a, b) => b._count - a._count)
        .findIndex((r) => r.userId === userId) + 1;
    const rankSymbols = ['', '👑', '🥈', '🥉'];
    const rankText = rank
      ? `${rankSymbols[rank] ?? ''}${rank}位/${ranking.length}人`
      : '参加なし';

    // 概要情報を表示
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
      })
      .addFields({
        name: '参加率ランキング (直近30日間)',
        value: rankText,
      });

    // 一旦フィールドを配列に入れ、ページング処理を行う
    const numFieldsPerPage = 5;
    const fields: APIEmbedField[] = [];

    // 主催イベントリストを表示
    splitStrings(
      hostEvents.map((event) => {
        if (!event) return '- 不明';
        const date = !event.startTime
          ? '未定'
          : `<t:${Math.floor(event.startTime.getTime() / 1000)}>`;
        return `- [${event.id.toString().padStart(3, ' ')}]　${date}　${event.name}　(${event.stats.length}人, ${event.games.length}試合)`;
      }),
      1024,
    ).forEach((line) => {
      fields.push({
        name: '主催イベントリスト',
        value: line,
      });
    });

    // 参加イベントリストを表示
    splitStrings(
      events.map((event) => {
        if (!event) return '- 不明';
        const date = !event.startTime
          ? '未定'
          : `<t:${Math.floor(event.startTime.getTime() / 1000)}>`;
        return `- [${event.id.toString().padStart(3, ' ')}]　${date}　${event.name}　(${event.stats.length}人, ${event.games.length}試合)`;
      }),
      1024,
    ).forEach((line) => {
      fields.push({
        name: '参加イベントリスト',
        value: line,
      });
    });

    // フィールドをページング
    const pages = fields.slice(
      (page - 1) * numFieldsPerPage,
      page * numFieldsPerPage,
    );
    let lastTitle: string | undefined = undefined;
    for (const pageField of pages) {
      // 同じタイトルの場合はゼロ幅スペース文字を入れる
      if (lastTitle === pageField.name) {
        pageField.name = '\u200b';
      }
      lastTitle = pageField.name;

      // フィールドを追加
      embeds.addFields(pageField);
    }

    // ページングしたことを表示
    if (fields.length > numFieldsPerPage) {
      embeds.setFooter({
        text: `ページ ${page}/${Math.ceil(fields.length / numFieldsPerPage)}\n\`/status user ～ page:${page + 1}\` で次のページを表示`,
      });
    }

    await interaction.editReply({
      embeds: [embeds],
    });
  }
}

export default new StatusUserCommand(statusCommand);
