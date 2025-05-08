import {
  ContextMenuCommandBuilder,
  PermissionFlagsBits,
  UserContextMenuCommandInteraction,
  VoiceChannel,
} from 'discord.js';
import { UserContextMenuInteraction } from '../base/contextmenu_base.js';
import eventManager from '../../event/EventManager.js';
import { logger } from '../../utils/log.js';
import { prisma } from '../../index.js';

class MuteUserMenu extends UserContextMenuInteraction {
  command = new ContextMenuCommandBuilder()
    .setName('🔇参加者をサーバーミュート')
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

    // イベント主催者のみ実行可能
    if (event.hostId !== interaction.user.id) {
      await interaction.editReply({
        content: 'このコマンドはイベント主催者のみが実行できます',
      });
      return;
    }

    const targetUser = interaction.targetUser;
    const targetMember = await interaction.guild?.members.fetch(targetUser.id);

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
      // ユーザーをサーバーミュート
      await targetMember.voice.setMute(true, 'イベント主催者によるミュート');

      // UserStatのmutedフラグを設定
      await prisma.userStat.upsert({
        where: {
          id: {
            eventId: event.id,
            userId: targetUser.id,
          },
        },
        update: {
          muted: true,
        },
        create: {
          eventId: event.id,
          userId: targetUser.id,
          duration: 0,
          muted: true,
        },
      });

      // VCのチャットにメッセージを送信
      await eventVC.send({
        content: `<@${targetUser.id}> あなたはイベント主催を妨げたためこのイベント中はミュートされます。他のVCへ移動するとサーバーミュートは解除されます。`,
      });

      await interaction.editReply({
        content: `${targetUser.username}をミュートしました`,
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
