import { ApplicationCommandPermissionType, GuildMember } from 'discord.js';

/**
 * 特定のコマンドの権限を持っているか確認
 * @param commandName 特定のコマンド名
 * @param member 権限をチェックするメンバー
 * @returns 権限を持っているか
 */
export async function checkCommandPermission(
  commandName: string,
  member: GuildMember,
): Promise<boolean> {
  // コマンドを取得
  const commands = await member.guild.commands.fetch();
  if (!commands) return false;
  // コマンドを検索
  const command = commands.find((c) => c.name === commandName);
  if (!command) return false;

  // デフォルトの権限を持っている場合は許可
  if (
    command.defaultMemberPermissions &&
    member.permissions.has(command.defaultMemberPermissions)
  ) {
    return true;
  }

  // 権限を取得
  const permissions = await command.permissions.fetch({}).catch(() => null);
  if (!permissions) return false;

  // コマンドの権限から許可がある権限設定を探す
  return permissions.some((permission) => {
    if (
      permission.type === ApplicationCommandPermissionType.Role &&
      member.roles.cache.has(permission.id)
    ) {
      return permission.permission;
    }
    if (
      permission.type === ApplicationCommandPermissionType.User &&
      member.user.id === permission.id
    ) {
      return permission.permission;
    }
    return false;
  });
}
