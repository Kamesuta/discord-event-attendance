import { EmbedBuilder, RepliableInteraction } from 'discord.js';
import { prisma } from '../utils/prisma.js';
import { User } from '@prisma/client';
import { config } from '../utils/config.js';
import { gameResultInclude } from '../domain/queries/gameQueries.js';
import { gameResultFormatter } from '../domain/formatters/GameResultFormatter.js';

/**
 * イベントの結果
 */
export interface Award {
  /** ユーザー */
  user: User;
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
 * ユーザーの戦績を表示する
 * @param interaction インタラクション
 * @param gameId 試合ID
 */
export async function showGameResults(
  interaction: RepliableInteraction,
  gameId: number,
): Promise<void> {
  try {
    const embeds = await makeGameResultEmbed(gameId);
    await interaction.editReply({
      embeds: [embeds],
    });
  } catch (error) {
    if (error instanceof Error) {
      await interaction.editReply(error.message);
    }
  }
}

/**
 * ゲームの勝敗の表示を作成する
 * @param gameId 試合ID
 * @returns Discordの埋め込み
 */
export async function makeGameResultEmbed(
  gameId: number,
): Promise<EmbedBuilder> {
  // 戦績
  const game = await prisma.gameResult.findUnique({
    where: {
      id: gameId,
    },
    ...gameResultInclude,
  });

  // 戦績が見つからない場合
  if (!game) {
    throw new Error('試合が見つかりませんでした');
  }

  // 回目を取得
  const resultCount = await getGameResultNumbering(game.eventId, game.id);

  // 表示
  const embeds = gameResultFormatter
    .makeEmbed(
      new EmbedBuilder()
        .setTitle(`🎮「${game.name}」の結果`)
        .setDescription(`第 ${resultCount} 回目の試合結果です`),
      game,
    )
    .addFields({
      name: 'イベント情報',
      value: game.event
        ? `[${game.event.name} (イベントID: ${game.event.id})](https://discord.com/events/${config.guild_id}/${game.event.eventId})`
        : 'なし',
    });

  return embeds;
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
