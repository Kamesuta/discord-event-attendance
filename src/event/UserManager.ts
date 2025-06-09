import {
  GuildMember,
  APIGuildMember,
  User as DiscordUser,
  APIUser,
} from 'discord.js';
import { prisma } from '../index.js';
import { Prisma, User } from '@prisma/client';

/**
 * ユーザー情報を取得します
 */
class UserManager {
  /**
   * ユーザーを作成または更新します
   * @param user ユーザーデータ
   * @returns ユーザー
   */
  async createUser(user: Prisma.UserCreateInput): Promise<User> {
    return prisma.user.upsert({
      where: {
        userId: user.userId,
      },
      update: user, // undefinedのフィールドは更新されない
      create: user,
    });
  }

  /**
   * ユーザーを取得または作成します
   * @param memberOrUser Discordのメンバー情報またはユーザー情報
   * @returns ユーザー
   */
  async getOrCreateUser(
    memberOrUser: GuildMember | APIGuildMember | DiscordUser | APIUser,
  ): Promise<User> {
    const user = 'user' in memberOrUser ? memberOrUser.user : memberOrUser;
    const member = 'user' in memberOrUser ? memberOrUser : undefined;
    const data = {
      userId: user.id,
      username: user.username,
      displayName: 'displayName' in user ? user.displayName : user.global_name,
      memberName: member
        ? 'displayName' in member
          ? member.displayName
          : member.nick
        : undefined,
      avatarURL:
        'displayAvatarURL' in user ? user.displayAvatarURL() : user.avatar,
      memberAvatarURL: member
        ? 'displayAvatarURL' in member
          ? member.displayAvatarURL()
          : member.avatar
        : undefined,
    };

    return this.createUser(data);
  }

  /**
   * ユーザーを取得する
   * @param userId DiscordのユーザーID
   * @returns ユーザー
   */
  async getUser(userId: string): Promise<User | undefined> {
    return (
      (await prisma.user.findUnique({
        where: {
          userId,
        },
      })) || undefined
    );
  }

  /**
   * ユーザーの表示名を取得します
   * @param user ユーザー
   * @returns 表示名
   */
  getUserName(user: User): string {
    return (
      user.memberName ??
      user.displayName ??
      user.username ??
      `<@${user.userId}>`
    );
  }

  /**
   * ユーザーのアバター画像URLを取得します
   * @param user ユーザー
   * @returns アバター画像URL
   */
  getUserAvatar(user: User): string | undefined {
    return user.memberAvatarURL ?? user.avatarURL ?? undefined;
  }
}

export default new UserManager();
