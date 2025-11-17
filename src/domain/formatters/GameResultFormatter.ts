import { EmbedBuilder } from 'discord.js';
import { Prisma } from '@prisma/client';
import { GameResultData } from '@/domain/queries/gameQueries';

/** ユーザーの結果 */
type UserGameResultWithUser = Prisma.UserGameResultGetPayload<{
  include: {
    user: true;
  };
}>;

/**
 * ゲーム結果フォーマッター
 */
class GameResultFormatter {
  /**
   * ゲームの勝敗の表示を作成する
   * @param embeds 埋め込み
   * @param game 試合
   * @returns Discordの埋め込み
   */
  makeEmbed(embeds: EmbedBuilder, game: GameResultData): EmbedBuilder {
    // 結果を表示
    embeds
      .setFooter({
        text: `試合ID: ${game.id}, イベントID: ${game.eventId}`,
      })
      .setColor('#ff8c00');

    // ユーザーをgroupごとに分ける
    const groups: { group: string; users: UserGameResultWithUser[] }[] = [];
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
                `${user.rank}位: <@${user.user.userId}> (${user.xp.toLocaleString(
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
                  `${user.rank}位: <@${user.user.userId}> (${user.xp.toLocaleString(
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
}

/**
 * ゲーム結果フォーマッターのインスタンス
 */
export const gameResultFormatter = new GameResultFormatter();
