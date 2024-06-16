import { EmbedBuilder, RepliableInteraction } from 'discord.js';
import { prisma } from '../index.js';
import { Prisma, UserGameResult } from '@prisma/client';
import { config } from '../utils/config.js';

/**
 * イベントの結果
 */
export interface Award {
  /** ユーザー */
  userId: string;
  /** ランク */
  rank: number;
  /** 経験値（XP） */
  xp?: number;
  /** 属するグループ */
  group?: string;
}

/** 連番アルファベット */
export const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** 順位&XP配分マップ */
export const xpMap = [100, 75, 50, 40, 30, 20, 10, 5, 4, 3, 2, 1];

/**
 * 試合の結果
 */
export type GameResultData = Prisma.GameResultGetPayload<{
  /**
   *
   */
  include: {
    users: true;
  };
}>;

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
  const game = await prisma.gameResult.findUnique({
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
  if (!game) {
    await interaction.editReply('試合が見つかりませんでした');
    return;
  }

  // 回目を取得
  const resultCount = await getGameResultNumbering(game.eventId, game.id);

  // 表示
  const embeds = makeEmbed(
    new EmbedBuilder()
      .setTitle(`🎮「${game.name}」の結果`)
      .setDescription(`第 ${resultCount} 回目の試合結果です`),
    game,
  ).addFields({
    name: 'イベント情報',
    value: game.event
      ? `[${game.event.name} (イベントID: ${game.event.id})](https://discord.com/events/${config.guild_id}/${game.event.eventId})`
      : 'なし',
  });

  await interaction.editReply({
    embeds: [embeds],
  });
}

/**
 * ゲームの勝敗の表示を作成する
 * @param embeds 埋め込み
 * @param game 試合
 * @returns Discordの埋め込み
 */
export function makeEmbed(
  embeds: EmbedBuilder,
  game: GameResultData,
): EmbedBuilder {
  // 結果を表示
  embeds
    .setFooter({
      text: `試合ID: ${game.id}, イベントID: ${game.eventId}`,
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
  gameId?: number,
): Promise<number> {
  if (gameId !== undefined) {
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
  } else {
    // イベントの試合数+1 = 何回目の試合か
    return (
      (await prisma.gameResult.count({
        where: {
          eventId,
        },
      })) + 1
    );
  }
}
