import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import statusCommand from './StatusCommand.js';
import { prisma } from '../../index.js';

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
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベントの出欠状況を表示
    const show = interaction.options.getBoolean('show') ?? false;
    await interaction.deferReply({ ephemeral: !show });

    // イベントを取得
    const events = await prisma.event.findMany({
      orderBy: {
        id: 'asc',
      },
      include: {
        stats: {
          where: {
            show: true,
          },
        },
        games: true,
      },
    });

    // [${イベントID(3桁空白埋め)}] <t:${開始日時}:> イベント名 (${参加者数}人, ${試合数}試合)
    const eventList = events.map((event) => {
      const date = !event.startTime
        ? '未定'
        : `<t:${Math.floor(event.startTime.getTime() / 1000)}>`;
      return `- [${event.id.toString().padStart(3, ' ')}]　${date}　${event.name}　(${event.stats.length}人, ${event.games.length}試合)`;
    });

    // Embed作成
    const embeds = new EmbedBuilder()
      .setTitle('イベント一覧')
      .setDescription(eventList.join('\n'))
      .setColor('#ff8c00')
      .setFooter({
        text: '/status event <イベントID> で詳細を確認できます',
      });

    await interaction.editReply({
      embeds: [embeds],
    });
  }
}

export default new StatusEventListCommand(statusCommand);
