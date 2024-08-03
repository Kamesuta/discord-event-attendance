import { Guild, GuildMember } from 'discord.js';
import { prisma } from '../index.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/log.js';

/**
 * ロールを同期する
 * @param guild ギルド
 * @param roleId ロールID
 * @param userIds ユーザーIDリスト
 * @returns ロール同期結果
 */
export async function syncRole(
  guild: Guild,
  roleId: string,
  userIds: string[],
): Promise<string | undefined> {
  // 既存のロール付与状況を確認する
  const role = await guild.roles.fetch(roleId);
  if (!role) {
    logger.warn(
      `ロール(ID: ${roleId})が見つからないため、ロールを同期できません。`,
    );
    return;
  }

  // すべてのユーザーを取得 (キャッシュを更新, GUILD_MEMBERS インテントが必要)
  await guild.members.fetch();

  // 付与すべきユーザーを取得
  const usersToAddIdSet = new Set(userIds);
  // メンバーをサーバーから取得
  const usersToAdd = await guild.members.fetch({ user: [...usersToAddIdSet] });
  // すでにロールを持っているユーザーを取得
  const currentRoleMembers = role.members;

  // 付与するユーザーと剥奪するユーザーを計算する
  const usersToRemove: GuildMember[] = [];

  // すでにロールを持っているユーザーの処理
  for (const member of currentRoleMembers.values()) {
    if (usersToAddIdSet.has(member.id)) {
      // 条件を満たしているユーザーは付与対象から外す
      usersToAddIdSet.delete(member.id);
    } else {
      // 条件を満たしていないユーザーは剥奪対象に追加
      usersToRemove.push(member);
    }
  }

  // 取得できなかったユーザーを取得
  const errorIds: string[] = [];

  // ロールを付与
  let countAdd = 0;
  for (const userId of usersToAddIdSet) {
    const member = usersToAdd.get(userId);
    if (member) {
      const result = await member.roles
        .add(roleId, '最近のイベント参加頻度が条件を満たしたため')
        .catch(() => {});
      logger.info(
        `ロール(${role.name})を付与${result ? 'しました' : 'に失敗しました'}: ${member.user.username} (${countAdd}/${usersToAddIdSet.size}人)`,
      );
      if (!result) {
        errorIds.push(userId);
      }
    } else {
      errorIds.push(userId);
      // logger.info(
      //   `メンバーの取得に失敗: ${userId} (${countAdd}/${usersToAddIdSet.size}人)`,
      // );
    }
    countAdd++;
  }

  // ロールを剥奪
  let countRemove = 0;
  for (const member of usersToRemove) {
    const result = await member.roles
      .remove(roleId, '最近のイベント参加頻度が条件を満たさなくなったため')
      .catch(() => {});
    logger.info(
      `ロール(${role.name})を剥奪${result ? 'しました' : 'に失敗しました'}: ${member.user.username} (${countRemove}/${usersToRemove.length}人)`,
    );
    if (!result) {
      errorIds.push(member.id);
    }
    countRemove++;
  }

  // ログを出力
  const addText = usersToAdd.map((member) => member.user.username).join(',');
  const addRemove = usersToRemove
    .map((member) => member.user.username)
    .join(',');
  const text = `ロール(ID: ${roleId})を同期しました。\n　付与: [${addText}]\n　剥奪: [${addRemove}]`;
  logger.info(text);
  return text;
}

/**
 * 条件を確認し、ロールを付与/剥奪する
 * @param guild ギルド
 * @returns ロール同期結果
 */
export async function syncRoleByCondition(guild: Guild): Promise<string> {
  // 集計し、条件を満たしているユーザーをピックアップする

  // すでに付与した人
  const alreadyGranted: Set<string> = new Set();

  // 結果テキスト
  let resultText = '';

  // 2. 直近1ヶ月(30日)以内にn回イベントに参加した
  const counts = await prisma.userStat.groupBy({
    by: ['userId'],
    where: {
      show: true,
      event: {
        startTime: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _count: true,
  });
  for (const [roleId, count] of Object.entries(
    config.recent_event_join_role_ids,
  ).sort((a, b) => b[1] - a[1])) {
    const userIds = counts
      // n回以上参加した人をピックアップ
      .filter((c) => c._count > Number(count))
      // すでに付与した人を除外
      .filter((c) => !alreadyGranted.has(c.userId))
      .map((c) => c.userId);
    // すでに付与した人リストに追加
    userIds.forEach((userId) => alreadyGranted.add(userId));
    // ロールを同期
    const result = await syncRole(guild, roleId, userIds);
    if (result) {
      resultText += `\`\`\`\n${result}\`\`\`\n`;
    }
  }

  // 1. 1回以上イベントに参加した
  const userStats = await prisma.userStat.findMany({
    where: {
      show: true,
    },
  });
  const userIds = userStats
    // すでに付与した人を除外
    .filter((stat) => !alreadyGranted.has(stat.userId))
    .map((stat) => stat.userId);
  const result = await syncRole(guild, config.event_join_role_id, userIds);
  if (result) {
    resultText += `\`\`\`\n${result}\`\`\`\n`;
  }

  // ログ
  logger.info('ロールを同期しました');

  return resultText;
}
