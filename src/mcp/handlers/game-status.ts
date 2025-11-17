import { z } from 'zod';
import { createMCPJSONResult, MCPToolResult } from '../types.js';
import { prisma } from '../../utils/prisma.js';

/**
 * get-game-statusツールの定義
 */
export const getGameStatusTool = {
  name: 'get-game-status',
  description: 'ゲーム結果を取得',
  inputSchema: {
    type: 'object' as const,
    properties: {
      gameId: {
        type: 'number' as const,
        description: 'ゲームID',
      },
    },
  },
};
import { gameResultInclude } from '../../domain/queries/gameQueries.js';

/**
 * get-game-statusのスキーマ
 */
const getGameStatusSchema = z.object({
  gameId: z.number(),
});

/**
 * ゲーム結果を取得
 * @param args 引数
 * @returns MCPツールの結果
 */
export async function getGameStatus(args: unknown): Promise<MCPToolResult> {
  const { gameId } = getGameStatusSchema.parse(args);

  // 戦績を取得
  const game = await prisma.gameResult.findUnique({
    where: {
      id: gameId,
    },
    ...gameResultInclude,
  });

  if (!game) {
    throw new Error('試合が見つかりませんでした');
  }

  // 何回目の試合かを取得
  const resultCount = await getGameResultNumbering(game.eventId, game.id);

  // ユーザーをgroupごとに分ける
  const groups: { group: string; users: typeof game.users }[] = [];
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

  // レスポンスデータを構築
  const response = {
    game: {
      id: game.id,
      name: game.name,
      url: game.url,
      image: game.image,
      resultNumber: resultCount,
    },
    event: game.event
      ? {
          id: game.event.id,
          eventId: game.event.eventId,
          name: game.event.name,
          startTime: game.event.startTime?.toISOString(),
          endTime: game.event.endTime?.toISOString(),
        }
      : null,
    results:
      groups.length === 0
        ? [
            {
              groupName: '順位',
              participants: game.users.map((user) => ({
                user: {
                  id: user.user.id,
                  userId: user.user.userId,
                  username: user.user.username,
                  displayName: user.user.displayName,
                  memberName: user.user.memberName,
                },
                rank: user.rank,
                xp: user.xp,
                group: user.group,
              })),
            },
          ]
        : groups.map(({ group, users }) => ({
            groupName: group,
            participants: users.map((user) => ({
              user: {
                id: user.user.id,
                userId: user.user.userId,
                username: user.user.username,
                displayName: user.user.displayName,
                memberName: user.user.memberName,
              },
              rank: user.rank,
              xp: user.xp,
              group: user.group,
            })),
          })),
    summary: {
      totalParticipants: game.users.length,
      totalXP: game.users.reduce((sum, user) => sum + user.xp, 0),
      averageXP:
        game.users.length > 0
          ? game.users.reduce((sum, user) => sum + user.xp, 0) /
            game.users.length
          : 0,
      groupCount: groups.length || 1,
    },
  };

  return createMCPJSONResult(response);
}

/**
 * 何回目の試合かを取得する
 * @param eventId イベントID
 * @param gameId 試合ID
 * @returns 何回目の試合か
 */
async function getGameResultNumbering(
  eventId: number,
  gameId: number,
): Promise<number> {
  const result = await prisma.$queryRaw<[{ num: number }]>`
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

  return result[0]?.num || 1;
}
