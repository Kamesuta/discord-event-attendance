import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  RepliableInteraction,
} from 'discord.js';
import { prisma } from '../index.js';
import { Event, Prisma, UserGameResult } from '@prisma/client';
import { config } from '../utils/config.js';

/**
 * ゲームの勝敗を記録する
 * @param interaction インタラクション
 * @param event イベント
 */
export async function addGameResult(
  interaction: ChatInputCommandInteraction,
  event: Event,
): Promise<void> {
  // 編集する試合IDを取得
  const editGameId = interaction.options.getInteger('game_id');
  const editGame = editGameId
    ? await prisma.gameResult.findUnique({
        where: {
          id: editGameId,
        },
      })
    : undefined;
  const eventId = editGame?.eventId ?? event.id;

  // ゲームの名前を取得
  const gameName = interaction.options.getString('game_name') ?? undefined;

  // XP倍率を取得
  const xpMultiplier = interaction.options.getNumber('xp_multiplier') ?? 1;

  // ランクを取得
  const ranks = [...Array(12).keys()]
    .map((i) => interaction.options.getUser(`rank${i + 1}`))
    .filter((item): item is NonNullable<typeof item> => item !== null);

  // アワード
  interface Award {
    rank: number;
    xp?: number;
    group?: string;
  }

  // チーム指定子 書式「2=優勝,4=準優勝,=参加(0.1)」
  const teamString = interaction.options.getString('team');
  // 指定されたチーム指定子
  const teamSpec: Award[] | undefined = teamString
    ? teamString.split(',').flatMap((team) => {
        const [m, rank, group, xp] =
          /(\d*)(?:=([^(]*)(?:\((\d+)\))?)?/.exec(team) ?? [];
        if (!m) {
          return [];
        }
        return [
          {
            rank: rank ? parseInt(rank) : 0,
            xp: xp !== undefined ? parseInt(xp) : undefined,
            group: group ? group.trim() : undefined,
          },
        ];
      })
    : undefined;

  // 順位&XP配分マップ
  const xpMap = [100, 75, 50, 40, 30, 20, 10, 5, 4, 3, 2, 1];

  // ユーザーごとの獲得
  // ・チーム指定子なし → 個人戦
  // ・チーム指定子あり、デフォルトのみ → 全員参加賞
  // ・チーム指定子あり、チーム指定子が1つ → 個人戦 + 残りは参加賞
  // ・チーム指定子あり、チーム指定子が2つ以上 → チーム戦
  const userAwards: Award[] = [];
  if (teamSpec) {
    // デフォルトの賞
    const defaultAward = teamSpec.find((spec) => spec.rank === 0);
    // チーム指定子による賞の割り当て
    const specAwards = teamSpec
      .filter((spec) => spec.rank !== 0)
      .sort((a, b) => a.rank - b.rank);

    let currentIndex = 0;
    if (specAwards.length === 0) {
      // チーム指定子がない場合 → 全員参加賞
    } else if (specAwards.length === 1) {
      // チーム指定子が1つの場合 → 個人戦
      // デフォルトの賞
      ranks.slice(0, specAwards[0].rank).forEach((_user, i) => {
        userAwards.push({
          rank: i + 1,
          xp: xpMap[i],
        });
        currentIndex++;
      });
    } else {
      // チーム指定子が2つ以上の場合 → チーム戦
      // 1～n位までのユーザーに賞を割り当て
      specAwards.forEach((spec, rank) => {
        while (currentIndex < spec.rank && currentIndex < ranks.length) {
          userAwards.push({
            rank: rank + 1,
            xp: spec.xp ?? xpMap[rank],
            group:
              spec.group ??
              (specAwards.length === 2
                ? ['勝ち', '負け'][rank]
                : `${rank + 1}位`), // 2チームの場合は「勝ち」「負け」
          });
          currentIndex++;
        }
      });
    }

    // 残りのユーザーにデフォルトの賞を割り当て
    while (currentIndex < ranks.length) {
      userAwards.push({
        rank: 0,
        xp: defaultAward?.xp ?? 0.1,
        group: defaultAward?.group ?? '参加',
      });
      currentIndex++;
    }
  } else {
    // デフォルトの賞
    ranks.forEach((_user, i) => {
      userAwards.push({
        rank: i + 1,
        xp: xpMap[i],
      });
    });
  }

  // DB編集クエリ
  const users =
    ranks.length === 0
      ? undefined
      : {
          deleteMany: editGameId !== null ? {} : undefined,
          createMany: {
            data: ranks.map((user, i) => ({
              eventId,
              userId: user.id,
              rank: userAwards[i].rank,
              xp: (userAwards[i].xp ?? 0) * xpMultiplier,
              group: userAwards[i].group,
            })),
          },
        };

  // URLを取得
  const url = interaction.options.getString('url') ?? undefined;
  const image =
    interaction.options.getAttachment('image')?.proxyURL ?? undefined;
  const deleteImage = interaction.options.getBoolean('delete_image') ?? false;

  // 試合の結果を記録
  const game =
    editGameId !== null
      ? await prisma.gameResult.update({
          where: {
            id: editGameId,
          },
          data: {
            name: gameName,
            url: url === 'null' ? null : url,
            image: deleteImage ? null : image,
            users,
          },
          include: {
            users: {
              orderBy: {
                rank: 'asc',
              },
            },
          },
        })
      : await prisma.gameResult.create({
          data: {
            eventId,
            name: gameName ?? '試合',
            url,
            image,
            users,
          },
          include: {
            users: {
              orderBy: {
                rank: 'asc',
              },
            },
          },
        });

  // 結果を表示
  const embeds = (await makeEmbed(game)).setTitle(
    `🎮「${game.name}」の結果が記録されました`,
  );

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
      users: {
        orderBy: {
          rank: 'asc',
        },
      },
    },
  });

  // 戦績が見つからない場合
  if (!gameResult) {
    await interaction.reply('試合が見つかりませんでした');
    return;
  }

  // 表示
  const embeds = (await makeEmbed(gameResult)).addFields({
    name: 'イベント情報',
    value: gameResult.event
      ? `[${gameResult.event.name} (イベントID: ${gameResult.event.id})](https://discord.com/events/${config.guild_id}/${gameResult.event.eventId})`
      : 'なし',
  });

  await interaction.editReply({
    embeds: [embeds],
  });
}

/**
 * ゲームの勝敗の表示を作成する
 * @param game 試合
 * @returns Discordの埋め込み
 */
async function makeEmbed(
  game: Prisma.GameResultGetPayload<{ include: { users: true } }>,
): Promise<EmbedBuilder> {
  // 回目を取得
  const resultCount = await getGameResultNumbering(game.eventId, game.id);

  // 結果を表示
  const embeds = new EmbedBuilder()
    .setTitle(`🎮「${game.name}」の結果`)
    .setDescription(`第 ${resultCount} 回目の試合結果です`)
    .setFooter({
      text: `試合ID: ${game.id}`,
    })
    .setColor('#ff8c00');

  // ユーザーをgroupごとに分ける
  const groups: { group: string; users: UserGameResult[] }[] = [];
  for (const user of game.users) {
    const key = user.group ?? '順位';
    const groupIndex = groups.findIndex(({ group }) => group === key);
    if (groupIndex === -1) {
      groups.push({ group: key, users: [user] });
    } else {
      groups[groupIndex].users.push(user);
    }
  }
  // '参加'グループを最後に移動
  const groupIndex = groups.findIndex(({ group }) => group === '参加');
  if (groupIndex !== -1) {
    const group = groups.splice(groupIndex, 1);
    groups.push(group[0]);
  }

  if (Object.keys(groups).length === 0) {
    embeds.addFields({
      name: '順位',
      value:
        game.users
          .map(
            (user) =>
              `${user.rank}位: <@${user.userId}> (${user.xp.toLocaleString(
                undefined,
                { maximumFractionDigits: 1 },
              )}XP)`,
          )
          .join('\n') || 'なし',
    });
  } else {
    for (const { group, users } of groups) {
      embeds.addFields({
        name: group,
        value:
          users
            .map(
              (user) =>
                `${user.rank}位: <@${user.userId}> (${user.xp.toLocaleString(
                  undefined,
                  { maximumFractionDigits: 1 },
                )}XP)`,
            )
            .join('\n') || 'なし',
      });
    }
  }

  if (game.url) {
    embeds.setURL(game.url);
  }
  if (game.image) {
    embeds.setImage(game.image);
  }

  return embeds;
}

/**
 * ユーザーの戦績を取得する
 * @param userId ユーザーID
 * @returns 戦績
 */
export async function getUserGameResults(userId: string): Promise<string[]> {
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

  return gameResults.flatMap((result) => {
    if (!result.event || !result.game) return [];
    return [
      `- [${result.event.name}](https://discord.com/events/${config.guild_id}/${result.event.eventId}) ${result.game.name}(ID:${result.game.id}) ${result.rank}位`,
    ];
  });
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
