import {
  GuildMember,
  GuildScheduledEventStatus,
  VoiceBasedChannel,
  VoiceState,
} from 'discord.js';
import { prisma } from './index.js';
import { config } from './utils/config.js';
import { tallyAttendanceTime } from './event/attendance_time.js';
import { logger } from './utils/log.js';
import userManager from './event/UserManager.js';

// 入退室ログを記録します
async function createVoiceLog(
  channel: VoiceBasedChannel,
  member: GuildMember,
  join: boolean,
): Promise<void> {
  // ログを記録する
  try {
    // 指定のサーバー以外無視
    if (channel.guild.id !== config.guild_id) {
      return;
    }

    // イベント開催中のボイスチャンネルにいるかどうかを確認する
    const event = await prisma.event.findFirst({
      where: {
        channelId: channel.id,
        active: GuildScheduledEventStatus.Active,
      },
      orderBy: {
        startTime: 'desc',
      },
      take: 1,
    });
    if (!event) {
      return;
    }

    // ユーザーを取得
    const user = await userManager.getOrCreateUser(member);

    // ユーザー情報を初期化
    await prisma.userStat.upsert({
      where: {
        id: {
          eventId: event.id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        eventId: event.id,
        userId: user.id,
        duration: 0,
      },
    });

    // ログを記録する
    await prisma.voiceLog.create({
      data: {
        eventId: event.id,
        userId: user.id,
        join,
      },
    });
    logger.info(
      `ユーザー(${user.id})がイベント(ID:${event.id},Name:${event.name})に${
        join ? '参加' : '退出'
      }しました。`,
    );
    if (!join) {
      // 参加時間を集計する
      await tallyAttendanceTime(event.id, user, new Date());
    }
  } catch (error) {
    logger.error('ログの記録に失敗しました。', error);
  }
}

/**
 * ミュート状態を制御します
 * @param channel 新しいボイスチャンネル
 * @param member メンバー
 */
async function handleMuteState(
  channel: VoiceBasedChannel,
  member: GuildMember,
): Promise<void> {
  try {
    // 指定のサーバー以外無視
    if (channel.guild.id !== config.guild_id) {
      return;
    }

    // VC切断した場合(=現在VCにいない場合)、ミュート状態がいじれないので無視
    if (!channel) {
      return;
    }

    // ユーザーを取得
    const user = await userManager.getOrCreateUser(member);

    // ユーザーの最新のミュート状態を取得
    const latestMute = await prisma.userMute.findFirst({
      where: {
        userId: user.id,
      },
      include: {
        event: true,
      },
      orderBy: {
        time: 'desc',
      },
    });

    // ミュートフラグがない人は無視
    if (!latestMute?.muted) {
      return;
    }

    // イベントが終了している場合はミュートを解除して記録する
    if (
      latestMute.event?.active !== (GuildScheduledEventStatus.Active as number)
    ) {
      // 現在ミュートされている場合のみ解除
      if (member.voice.serverMute) {
        await member.voice.setMute(false, 'イベントが終了したためミュート解除');
        await prisma.userMute.create({
          data: {
            userId: user.id,
            eventId: latestMute.eventId,
            muted: false,
          },
        });
        logger.info(
          `ユーザー(${user.userId})のミュートを解除しました (イベント終了後の参加)`,
        );
      }
      return;
    }

    // イベントVCにいる場合はミュート、それ以外は解除
    const isEventVC = channel.id === latestMute.event?.channelId;
    if (member.voice.serverMute !== isEventVC) {
      await member.voice.setMute(
        isEventVC,
        isEventVC
          ? 'イベントVCに再参加したためミュート'
          : 'イベントVCから退出したためミュート解除',
      );
      logger.info(
        `ユーザー(${user.userId})を${isEventVC ? 'ミュート' : 'ミュート解除'}しました (${
          isEventVC ? 'イベントVCに再参加' : 'イベントVCから退出'
        })`,
      );
    }
  } catch (error) {
    logger.error('ミュート状態の制御に失敗しました。', error);
  }
}

/**
 * 入退室時のイベントハンドラー
 * @param oldState 前の状態
 * @param newState 新しい状態
 */
export async function onVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  try {
    if (oldState.channel === newState.channel) return;

    if (newState.channel && !newState.member?.user.bot) {
      // ユーザーがボイスチャンネルに参加したとき
      const member = newState.member;
      if (member?.id) {
        await createVoiceLog(newState.channel, member, true);
        await handleMuteState(newState.channel, member);
      }
    }

    if (oldState.channel && !oldState.member?.user.bot) {
      // ユーザーがボイスチャンネルから退出したとき
      const member = oldState.member;
      if (member?.id) {
        await createVoiceLog(oldState.channel, member, false);
      }
    }
  } catch (error) {
    logger.error('onVoiceStateUpdate中にエラーが発生しました。', error);
  }
}
