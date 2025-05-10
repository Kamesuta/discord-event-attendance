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

// 入退室ログを記録します
async function createVoiceLog(
  channel: VoiceBasedChannel,
  userId: string,
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

    // ユーザー情報を初期化
    await prisma.userStat.upsert({
      where: {
        id: {
          eventId: event.id,
          userId,
        },
      },
      update: {},
      create: {
        eventId: event.id,
        userId,
        duration: 0,
      },
    });

    // ログを記録する
    await prisma.voiceLog.create({
      data: {
        eventId: event.id,
        userId,
        join,
      },
    });
    logger.info(
      `ユーザー(${userId})がイベント(ID:${event.id},Name:${event.name})に${
        join ? '参加' : '退出'
      }しました。`,
    );
    if (!join) {
      // 参加時間を集計する
      await tallyAttendanceTime(event.id, userId, new Date());
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

    // ユーザーの最新のミュート状態を取得
    const latestMute = await prisma.userMute.findFirst({
      where: {
        userId: member.id,
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
      if (member.voice.mute) {
        await member.voice.setMute(false, 'イベントが終了したためミュート解除');
        await prisma.userMute.create({
          data: {
            userId: member.id,
            eventId: latestMute.eventId,
            muted: false,
          },
        });
        logger.info(
          `ユーザー(${member.id})のミュートを解除しました (イベント終了後の参加)`,
        );
      }
      return;
    }

    // イベントVCにいる場合はミュート、それ以外は解除
    const isEventVC = channel.id === latestMute.event?.channelId;
    if (member.voice.mute !== isEventVC) {
      await member.voice.setMute(
        isEventVC,
        isEventVC
          ? 'イベントVCに再参加したためミュート'
          : 'イベントVCから退出したためミュート解除',
      );
      logger.info(
        `ユーザー(${member.id})を${isEventVC ? 'ミュート' : 'ミュート解除'}しました (${
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
        await createVoiceLog(newState.channel, member.id, true);
        await handleMuteState(newState.channel, member);
      }
    }

    if (oldState.channel && !oldState.member?.user.bot) {
      // ユーザーがボイスチャンネルから退出したとき
      const member = oldState.member;
      if (member?.id) {
        await createVoiceLog(oldState.channel, member.id, false);
      }
    }
  } catch (error) {
    logger.error('onVoiceStateUpdate中にエラーが発生しました。', error);
  }
}
