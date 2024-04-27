import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { prisma } from './index.js';
import { Event } from '@prisma/client';
import { config } from './utils/config.js';

/**
 * ゲームの勝敗を記録するコマンド
 * @param subcommand サブコマンド
 * @returns サブコマンド
 */
export function createGameCommand(
  subcommand: SlashCommandSubcommandBuilder
): SlashCommandSubcommandBuilder {
  return subcommand
    .setName('game')
    .setDescription('ゲームの勝敗を記録します')
    .addStringOption((option) =>
      option.setName('game_name').setDescription('ゲーム名').setRequired(true)
    )
    .addUserOption((option) =>
      option.setName('rank1').setDescription('1位のユーザー').setRequired(true)
    )
    .addUserOption((option) =>
      option.setName('rank2').setDescription('2位のユーザー').setRequired(false)
    )
    .addUserOption((option) =>
      option.setName('rank3').setDescription('3位のユーザー').setRequired(false)
    )
    .addUserOption((option) =>
      option.setName('rank4').setDescription('4位のユーザー').setRequired(false)
    )
    .addUserOption((option) =>
      option.setName('rank5').setDescription('5位のユーザー').setRequired(false)
    )
    .addUserOption((option) =>
      option.setName('rank6').setDescription('6位のユーザー').setRequired(false)
    )
    .addUserOption((option) =>
      option.setName('rank7').setDescription('7位のユーザー').setRequired(false)
    )
    .addUserOption((option) =>
      option.setName('rank8').setDescription('8位のユーザー').setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('event_id')
        .setDescription('イベントID (省略時は最新のイベントを操作)')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option.setName('url').setDescription('試合のURL').setRequired(false)
    )
    .addNumberOption((option) =>
      option
        .setName('xp_multiplier')
        .setDescription('XP倍率')
        .setRequired(false)
    );
}

/**
 * ゲームの勝敗を記録する
 * @param interaction インタラクション
 * @param event イベント
 */
export async function addGameResult(
  interaction: ChatInputCommandInteraction,
  event: Event
): Promise<void> {
  // ゲームの名前を取得
  const gameName = interaction.options.getString('game_name') ?? 'ゲーム';

  // ランク→XPテーブル
  const rankXpTable = [100, 75, 50, 40, 30, 20, 10, 5];

  // XP倍率を取得
  const xpMultiplier = interaction.options.getNumber('xp_multiplier') ?? 1;

  // ランクを取得
  const ranks = [...Array(5).keys()]
    .map((i) => interaction.options.getUser(`rank${i + 1}`))
    .filter((item): item is NonNullable<typeof item> => item !== null);

  // URLを取得
  const url = interaction.options.getString('url');

  // 試合の結果を記録
  const game = await prisma.gameResult.create({
    data: {
      eventId: event.id,
      name: gameName,
      url,
    },
  });

  // 回目を取得
  const resultCount = await prisma.gameResult.count({
    where: {
      eventId: event.id,
    },
  });

  // ランクを保存
  await prisma.userGameResult.createMany({
    data: ranks.map((rank, i) => ({
      eventId: event.id,
      userId: rank.id,
      gameId: game.id,
      rank: i + 1,
      xp: rankXpTable[i] * xpMultiplier,
    })),
  });

  // 結果を表示
  const embeds = new EmbedBuilder()
    .setTitle(`🎮「${gameName}」の結果が記録されました`)
    .setDescription(`第 ${resultCount} 回目の試合結果です`)
    .addFields({
      name: '順位',
      value:
        ranks
          .map(
            (rank, i) =>
              `${i + 1}位: <@${rank.id}> (${Math.floor(
                rankXpTable[i] * xpMultiplier
              )}XP)`
          )
          .join('\n') || 'なし',
    })
    .setColor('#ff8c00');

  if (url) {
    embeds.setURL(url);
  }

  await interaction.editReply({
    embeds: [embeds],
  });
}

/**
 * ユーザーの戦績を取得する
 * @param userId ユーザーID
 * @returns 戦績
 */
export async function getUserGameResults(userId: string): Promise<string> {
  // 戦績
  const gameResults = await prisma.userGameResult.findMany({
    where: {
      userId,
    },
    orderBy: {
      rank: 'asc',
    },
    include: {
      game: true,
      event: true,
    },
  });

  return (
    gameResults
      .flatMap((result) => {
        if (!result.event || !result.game) return [];
        return [
          `- [${result.event.name}](https://discord.com/events/${config.guild_id}/${result.event.eventId}) ${result.game.name}(ID:${result.game.id}) ${result.rank}位`,
        ];
      })
      .join('\n') || 'なし'
  );
}
