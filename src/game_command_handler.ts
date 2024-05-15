import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  RepliableInteraction,
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
  subcommand: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return subcommand
    .setName('game')
    .setDescription('ゲームの勝敗を記録します')
    .addStringOption((option) =>
      option.setName('game_name').setDescription('ゲーム名').setRequired(true),
    )
    .addUserOption((option) =>
      option.setName('rank1').setDescription('1位のユーザー').setRequired(true),
    )
    .addUserOption((option) =>
      option
        .setName('rank2')
        .setDescription('2位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank3')
        .setDescription('3位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank4')
        .setDescription('4位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank5')
        .setDescription('5位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank6')
        .setDescription('6位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank7')
        .setDescription('7位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank8')
        .setDescription('8位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank9')
        .setDescription('9位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank10')
        .setDescription('10位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank11')
        .setDescription('11位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank12')
        .setDescription('12位のユーザー')
        .setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName('event_id')
        .setDescription('イベントID (省略時は最新のイベントを操作)')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('url').setDescription('試合のURL').setRequired(false),
    )
    .addAttachmentOption((option) =>
      option.setName('image').setDescription('試合の画像').setRequired(false),
    )
    .addNumberOption((option) =>
      option
        .setName('xp_multiplier')
        .setDescription('XP倍率')
        .setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName('edit_id')
        .setDescription('編集する試合ID')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('成績のタイプ')
        .setRequired(false)
        .addChoices({
          name: '個人戦',
          value: 'individual',
        })
        .addChoices({
          name: '参加賞',
          value: 'participation',
        }),
    );
}

/**
 * ゲームの勝敗を記録する
 * @param interaction インタラクション
 * @param event イベント
 */
export async function addGameResult(
  interaction: ChatInputCommandInteraction,
  event: Event,
): Promise<void> {
  // ゲームの名前を取得
  const gameName = interaction.options.getString('game_name') ?? 'ゲーム';

  // XP倍率を取得
  const xpMultiplier = interaction.options.getNumber('xp_multiplier') ?? 1;

  // ランクを取得
  const ranks = [...Array(12).keys()]
    .map((i) => interaction.options.getUser(`rank${i + 1}`))
    .filter((item): item is NonNullable<typeof item> => item !== null);

  // タイプを取得
  const type = (interaction.options.getString('type') ?? 'individual') as
    | 'individual'
    | 'participation';

  // 順位&XP配分マップ
  const xpMap = {
    individual: [100, 75, 50, 40, 30, 20, 10, 5, 4, 3, 2, 1],
    participation: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
  };
  const rankMap = {
    individual: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    participation: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };

  // URLを取得
  const url = interaction.options.getString('url');
  const image = interaction.options.getAttachment('image');

  // 編集する試合IDを取得
  const editGameId = interaction.options.getInteger('edit_id');

  // 試合の結果を記録
  const game =
    editGameId !== null
      ? await prisma.gameResult.update({
          where: {
            id: editGameId,
          },
          data: {
            name: gameName,
            url,
            image: image?.proxyURL,
            users: {
              deleteMany: {},
              createMany: {
                data: ranks.map((rank, i) => ({
                  eventId: event.id,
                  userId: rank.id,
                  rank: rankMap[type][i],
                  xp: xpMap[type][i] * xpMultiplier,
                })),
              },
            },
          },
        })
      : await prisma.gameResult.create({
          data: {
            eventId: event.id,
            name: gameName,
            url,
            image: image?.proxyURL,
            users: {
              createMany: {
                data: ranks.map((rank, i) => ({
                  eventId: event.id,
                  userId: rank.id,
                  rank: rankMap[type][i],
                  xp: xpMap[type][i] * xpMultiplier,
                })),
              },
            },
          },
        });

  // 回目を取得
  const resultCount = await getGameResultNumbering(event.id, game.id);

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
              `${rankMap[type][i]}位: <@${rank.id}> (${Math.floor(
                xpMap[type][i] * xpMultiplier,
              )}XP)`,
          )
          .join('\n') || 'なし',
    })
    .setFooter({
      text: `試合ID: ${game.id}`,
    })
    .setColor('#ff8c00');

  if (url) {
    embeds.setURL(url);
  }
  if (image) {
    embeds.setImage(image.proxyURL);
  }

  await interaction.editReply({
    embeds: [embeds],
  });
}

/**
 * ユーザーの戦績を表示する
 * @param interaction インタラクション
 * @param gameId 試合ID
 */
export async function showGameResults(
  interaction: RepliableInteraction,
  gameId: number,
): Promise<void> {
  // 戦績
  const gameResult = await prisma.gameResult.findUnique({
    where: {
      id: gameId,
    },
    include: {
      event: true,
      users: true,
    },
  });

  // 戦績が見つからない場合
  if (!gameResult) {
    await interaction.reply('試合が見つかりませんでした');
    return;
  }

  // 回目を取得
  const resultCount = await getGameResultNumbering(gameResult.eventId, gameId);

  // 表示
  const embeds = new EmbedBuilder()
    .setTitle(`🎮「${gameResult.name}」の結果`)
    .setDescription(`第 ${resultCount} 回目の試合結果です`)
    .addFields({
      name: '順位',
      value:
        gameResult.users
          .map((user) => `${user.rank}位: <@${user.userId}> (${user.xp}XP)`)
          .join('\n') || 'なし',
    })
    .addFields({
      name: 'イベント情報',
      value: gameResult.event
        ? `[${gameResult.event.name} (イベントID: ${gameResult.event.id})](https://discord.com/events/${config.guild_id}/${gameResult.event.eventId})`
        : 'なし',
    })
    .setFooter({
      text: `試合ID: ${gameResult.id}`,
    })
    .setColor('#ff8c00');

  if (gameResult.url) {
    embeds.setURL(gameResult.url);
  }
  if (gameResult.image) {
    embeds.setImage(gameResult.image);
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

/**
 * 何回目の試合かを取得する
 * @param eventId イベントID
 * @param gameId 試合ID
 * @returns 何回目の試合か
 */
export async function getGameResultNumbering(
  eventId: number,
  gameId: number,
): Promise<number> {
  const {
    0: { num: resultCount },
  } = await prisma.$queryRaw<[{ num: number }]>`
    SELECT num
    FROM (
      SELECT
        ROW_NUMBER() over (ORDER BY id ASC) num,
        id
      FROM GameResult
      WHERE eventId = ${eventId}
    ) as t
    WHERE t.id = ${gameId};
  `;
  return resultCount;
}
