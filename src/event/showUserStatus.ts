import { EmbedBuilder, RepliableInteraction } from 'discord.js';
import { config } from '../utils/config.js';
import { getUserGameResults } from '../game_command_handler.js';
import splitStrings from '../event/splitStrings.js';
import { prisma } from '../index.js';

/**
 * ユーザーの過去のイベント参加状況を表示
 * @param interaction インタラクション
 * @param userId ユーザーID
 */
export default async function showUserStatus(
  interaction: RepliableInteraction,
  userId: string,
): Promise<void> {
  // ユーザーの過去のイベント参加状況を表示
  const stats = await prisma.userStat.findMany({
    where: {
      userId,
      show: true,
    },
    include: {
      event: true,
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
      value: `${stats.length} / ${eventCount} 回`,
    });

  splitStrings(
    stats.map((stat) => {
      if (!stat.event) return '- 不明';
      return `- [${stat.event.name}](https://discord.com/events/${config.guild_id}/${stat.event.eventId})`;
    }),
    1024,
  ).forEach((line, i) => {
    embeds.addFields({
      name: i === 0 ? '参加イベントリスト' : '\u200b',
      value: line,
    });
  });

  splitStrings(await getUserGameResults(userId), 1024).forEach((line, i) => {
    embeds.addFields({
      name: i === 0 ? 'ゲーム戦績' : '\u200b',
      value: line,
    });
  });

  await interaction.editReply({
    embeds: [embeds],
  });
}
