import {
  ActionRowBuilder,
  EmbedBuilder,
  RepliableInteraction,
  UserSelectMenuBuilder,
} from 'discord.js';
import { updateAttendanceTimeIfEventActive } from './attendance_time.js';
import { prisma } from '../index.js';
import { config } from '../utils/config.js';
import { Event } from '@prisma/client';
import reviewMarkUserSelectAction from '../commands/action/ReviewMarkUserSelectAction.js';

/**
 * イベントの出欠状況チェックパネルを表示します
 * @param interaction インタラクション
 * @param event イベント
 */
export default async function reviewEvent(
  interaction: RepliableInteraction,
  event: Event,
): Promise<void> {
  // 集計
  await updateAttendanceTimeIfEventActive(event);

  // イベントの出欠状況を表示
  const stats = await prisma.userStat.findMany({
    where: {
      eventId: event.id,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      OR: [
        {
          show: true,
        },
        {
          duration: {
            // 必要接続分数を満たしているユーザーのみを抽出する (config.required_time分以上参加している)
            gt: config.required_time * 60 * 1000,
          },
        },
      ],
    },
  });

  const embeds = new EmbedBuilder()
    .setTitle(`🏁「${event.name}」イベントに参加してくれた人を選択してください`)
    .setURL(`https://discord.com/events/${config.guild_id}/${event.eventId}`)
    .setFooter({
      text: `イベントID: ${event.id}`,
    })
    .setDescription(
      '出席、欠席のステータスです。\n下のプルダウンからステータスを変更できます。\n\n' +
        // 非公開モードの場合は全員表示 (現在のステータスも表示)
        stats
          .map((stat) => {
            const memo = stat.memo ? ` (**メモ**: ${stat.memo})` : '';
            const mark = stat.show === null ? '⬛' : stat.show ? '☑️' : '❌';
            const duration = Math.floor(stat.duration / 1000 / 60);
            return `${mark} <@${stat.userId}>: ${duration}分${memo}`;
          })
          .join('\n') || 'なし',
    )
    .setColor('#ff8c00');

  // マークされていないされていないユーザーIDを取得 → プルダウンのデフォルト値に設定
  const selectedUserIds = stats
    .filter((stat) => stat.show === null)
    .map((stat) => stat.userId);

  const components = [
    // 出席プルダウン
    new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      reviewMarkUserSelectAction.create(event, selectedUserIds, 'show'),
    ),
    // 除外プルダウン
    new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      reviewMarkUserSelectAction.create(event, selectedUserIds, 'hide'),
    ),
  ];

  // イベントの出欠状況を表示
  const message = await interaction.editReply({
    embeds: [embeds],
    components,
  });
  // メッセージにインタラクションを関連付け
  reviewMarkUserSelectAction.registerInteraction(message, interaction);
}
