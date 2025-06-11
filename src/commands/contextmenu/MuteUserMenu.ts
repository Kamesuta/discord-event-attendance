import {
  ContextMenuCommandBuilder,
  GuildScheduledEventStatus,
  PermissionFlagsBits,
  UserContextMenuCommandInteraction,
  VoiceChannel,
} from 'discord.js';
import { UserContextMenuInteraction } from '../base/contextmenu_base.js';
import eventManager from '../../event/EventManager.js';
import { logger } from '../../utils/log.js';
import { prisma } from '../../index.js';
import { checkCommandPermission } from '../../event/checkCommandPermission.js';
import userManager from '../../event/UserManager.js';

class MuteUserMenu extends UserContextMenuInteraction {
  command = new ContextMenuCommandBuilder()
    .setName('参加者をサーバーミュート')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);

  async onCommand(
    interaction: UserContextMenuCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });
    const event = await eventManager.getEvent(interaction);
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }
    if (event.active !== (GuildScheduledEventStatus.Active as number)) {
      await interaction.editReply({
        content: 'イベントが開催中ではありません',
      });
      return;
    }

    // メンバー情報を取得
    const member = await interaction.guild?.members
      .fetch(interaction.user.id)
      .catch(() => undefined);
    if (!member) {
      await interaction.editReply({
        content: 'メンバー情報の取得に失敗しました',
      });
      return;
    }

    // 権限をチェック
    if (
      // イベントの主催者か
      event.host?.userId !== interaction.user.id &&
      // /event_admin で権限を持っているか
      !(await checkCommandPermission('event_admin', member))
    ) {
      await interaction.editReply({
        content: 'イベント主催者のみがサーバーミュートできます',
      });
      return;
    }

    // 対象ユーザーを取得
    const targetUser = await userManager.getOrCreateUser(
      interaction.targetMember ?? interaction.targetUser,
    );
    const targetMember = await interaction.guild?.members.fetch(
      targetUser.userId,
    );
    if (!targetMember) {
      await interaction.editReply({
        content: '対象ユーザーが見つかりませんでした',
      });
      return;
    }

    // イベントのVCを取得
    const eventVC = event.channelId
      ? ((await interaction.guild?.channels.fetch(
          event.channelId,
        )) as VoiceChannel)
      : null;

    if (!eventVC) {
      await interaction.editReply({
        content: 'イベントのVCが見つかりませんでした',
      });
      return;
    }

    try {
      // ユーザーの最新のミュート状態を取得
      const latestMute = await prisma.userMute.findFirst({
        where: {
          userId: targetUser.id,
        },
        orderBy: {
          time: 'desc',
        },
      });

      const isMuted = latestMute?.muted ?? false;
      const newMuteState = !isMuted;

      // ユーザーのミュート状態を切り替え
      await targetMember.voice.setMute(
        newMuteState,
        newMuteState
          ? 'イベント主催者によるミュート'
          : 'イベント主催者によるミュート解除',
      );

      // UserMuteに記録
      await prisma.userMute.create({
        data: {
          userId: targetUser.id,
          eventId: event.id,
          muted: newMuteState,
        },
      });

      // VCのチャットにメッセージを送信
      await eventVC.send({
        content: newMuteState
          ? `<@${targetUser.userId}> イベント主催を妨げたためこのイベント中はミュートされます。他のVCへ移動するとサーバーミュートは解除されます。`
          : `<@${targetUser.userId}> ミュートが解除されました。`,
      });

      await interaction.editReply({
        content: `<@${targetUser.userId}> を${newMuteState ? 'ミュート' : 'ミュート解除'}しました`,
      });
    } catch (error) {
      logger.error(
        'ミュート処理中にエラーが発生しました: 主催者(id: ' +
          interaction.user.id +
          ') 対象ユーザー(id: ' +
          targetUser.id +
          ')',
        error,
      );
      await interaction.editReply({
        content: 'ミュート処理中にエラーが発生しました',
      });
    }
  }
}

export default new MuteUserMenu();
