import {
  ActionRowBuilder,
  EmbedBuilder,
  Message,
  RepliableInteraction,
  StringSelectMenuBuilder,
} from 'discord.js';
import { prisma } from '../index.js';
import { config } from '../utils/config.js';
import { Event } from '@prisma/client';
import { updateAttendanceTimeIfEventActive } from './attendance_time.js';
import getWebhook from './getWebhook.js';
import splitStrings from './splitStrings.js';

/**
 * イベント情報を表示します
 * @param interaction インタラクション
 * @param event イベント
 * @param isWebhook Webhookで送信するかどうか
 * @param message Webhookで送信するメッセージ
 * @param eventLinkMessage イベントリンクに表示するメッセージ
 * @param editMessage 編集するメッセージ
 */
export default async function showEvent(
  interaction: RepliableInteraction,
  event: Event,
  isWebhook = false,
  message?: string,
  eventLinkMessage?: string,
  editMessage?: Message,
): Promise<void> {
  // 集計
  await updateAttendanceTimeIfEventActive(event);

  // Webhookを取得
  const webhook = !isWebhook ? undefined : await getWebhook(interaction);
  if (isWebhook && !webhook) {
    return;
  }

  // イベントの出欠状況を表示
  const stats = await prisma.userStat.findMany({
    where: {
      eventId: event.id,
      show: true,
    },
  });

  // ユーザーごとに参加回数をカウント
  const userCount = Object.fromEntries(
    await Promise.all(
      stats.map(async (stat) => {
        const count = await prisma.userStat.count({
          where: {
            userId: stat.userId,
            show: true,
          },
        });
        return [stat.userId, count] as const;
      }),
    ),
  );

  // イベントの時間を計算
  const duration =
    event.startTime && event.endTime
      ? ` (${Math.floor(
          (event.endTime.getTime() - event.startTime.getTime()) / 1000 / 60,
        )}分)`
      : '';

  // ユーザーごとのXP合計を取得
  const userXp = (
    await Promise.all(
      stats.map(async (stat) => {
        const xp = await prisma.userGameResult.aggregate({
          where: {
            eventId: event.id,
            userId: stat.userId,
          },
          // eslint-disable-next-line @typescript-eslint/naming-convention
          _sum: {
            xp: true,
          },
        });
        return [stat.userId, xp._sum.xp ?? 0] as const;
      }),
    )
  )
    .filter(([, xp]) => xp > 0)
    .sort(([, a], [, b]) => b - a);

  // 試合結果
  const gameResults = await prisma.gameResult.findMany({
    where: {
      eventId: event.id,
    },
    include: {
      users: true,
    },
  });

  const dateToMention = (date: Date | null): string | null =>
    date ? `<t:${Math.floor(date.getTime() / 1000)}:F>` : null;

  // スケジュール
  const schedule = event.startTime
    ? `${dateToMention(event.startTime)} 〜 ${
        dateToMention(event.endTime) ?? '未定'
      } ${duration}`
    : dateToMention(event.scheduleTime) ?? '未定';

  // Embedを作成
  const embeds = new EmbedBuilder()
    .setTitle(
      event.endTime
        ? `🏁「${event.name}」イベントに参加してくれた人！`
        : `🏁「${event.name}」イベントの予定！`,
    )
    .setURL(`https://discord.com/events/${config.guild_id}/${event.eventId}`)
    .setDescription(event.description ? event.description : '説明なし')
    .setImage(event.coverImage)
    .setColor('#ff8c00')
    .setFooter({
      text: `「/status user <名前>」でユーザーの過去イベントの参加状況を確認できます${
        gameResults.length === 0
          ? ''
          : '\n下記プルダウンから各試合結果を確認できます'
      }\nイベントID: ${event.id}`,
    })
    .addFields({
      name: '開催日時',
      value: schedule,
    });

  if (event.endTime) {
    splitStrings(
      stats
        .filter((stat) => stat.show)
        .map((stat) => {
          const count = userCount[stat.userId];
          const memo = stat.memo ? ` ${stat.memo}` : '';
          const countText =
            count === 1 ? '(🆕 初参加！)' : ` (${count}回目)${memo}`;
          return `<@${stat.userId}> ${countText}`;
        }),
      1024,
    )
      .filter((line) => line.length > 0)
      .forEach((line, i) => {
        embeds.addFields({
          name: i === 0 ? '参加者' : '\u200b',
          value: line,
        });
      });

    embeds.addFields({
      name: `戦績 (計${gameResults.length}試合)`,
      value:
        userXp
          .map(([userId, xp], i) => `${i + 1}位: <@${userId}> (${xp}XP)`)
          .join('\n') || 'なし',
    });
  } else {
    // イベントが終了していない場合は、イベント終了後に参加者が表示される旨を記載
    embeds.addFields({
      name: '参加者/戦績',
      value: `イベント終了後、ここに参加者が表示されます\n参加したい人は[「興味あり」](https://discord.com/events/${config.guild_id}/${event.eventId})を押すと特殊な通知を受け取れます！`,
    });

    // メッセージにもリンクを乗せる
    if (message && eventLinkMessage) {
      message += `\n\n[${eventLinkMessage}](https://discord.com/events/${config.guild_id}/${event.eventId})`;
    }
  }

  // 試合結果のプルダウンを追加
  const components =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`event_component_game_${event.id}`)
        .setPlaceholder('確認したい試合結果を選択')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          gameResults.map((game) => ({
            label: `${game.name} (試合ID: ${game.id})`,
            value: game.id.toString(),
          })),
        ),
    );

  // 送信内容
  const contents = {
    content: message,
    embeds: [embeds],
    components: gameResults.length === 0 ? [] : [components],
  };

  if (webhook) {
    // Webhookで送信 (コマンド送信者の名前とアイコンを表示)
    const memberDisplayName =
      interaction.guild?.members.resolve(interaction.user.id)?.displayName ??
      interaction.user.username;
    const memberAvatar =
      interaction.guild?.members
        .resolve(interaction.user.id)
        ?.displayAvatarURL() ?? interaction.user.displayAvatarURL();
    if (editMessage) {
      // 既存メッセージを編集
      await webhook.webhook.editMessage(editMessage, {
        embeds: [embeds],
        components: gameResults.length === 0 ? [] : [components],
      });
    } else {
      await webhook.webhook.send({
        threadId: webhook.thread?.id,
        username: memberDisplayName,
        avatarURL: memberAvatar,
        ...contents,
      });
    }

    // 送信結果
    await interaction.editReply({
      content: 'イベント情報を公開しました',
    });
  } else {
    // 通常送信
    await interaction.editReply(contents);
  }
}
