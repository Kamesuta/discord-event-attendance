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
 * @param channel ボイスチャンネル
 * @param member メンバー
 * @param join 参加したかどうか
 */
async function handleMuteState(
  channel: VoiceBasedChannel,
  member: GuildMember,
  join: boolean,
): Promise<void> {
  try {
    // 指定のサーバー以外無視
    if (channel.guild.id !== config.guild_id) {
      return;
    }

    // イベント開催中のボイスチャンネルを取得
    const activeEvent = await prisma.event.findFirst({
      where: {
        channelId: channel.id,
        active: GuildScheduledEventStatus.Active,
      },
      orderBy: {
        startTime: 'desc',
      },
      take: 1,
    });

    if (!activeEvent) return;

    // ユーザーのミュート状態を取得
    const userStat = await prisma.userStat.findUnique({
      where: {
        id: {
          eventId: activeEvent.id,
          userId: member.id,
        },
      },
    });

    if (userStat?.muted) {
      // イベントVCから他のVCに移動した場合
      if (!join && channel.id === activeEvent.channelId) {
        // ミュートを解除
        await member.voice.setMute(false, 'イベントVCから退出したため');
        logger.info(
          `ユーザー(${member.id})のミュートを解除しました (イベントVCから退出)`,
        );
      }

      // 他のVCからイベントVCに移動した場合
      else if (join && channel.id === activeEvent.channelId) {
        // ミュートを再適用
        await member.voice.setMute(true, 'イベントVCに再参加したため');
        logger.info(
          `ユーザー(${member.id})を再度ミュートしました (イベントVCに再参加)`,
        );
      }
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
        await handleMuteState(newState.channel, member, true);
      }
    }

    if (oldState.channel && !oldState.member?.user.bot) {
      // ユーザーがボイスチャンネルから退出したとき
      const member = oldState.member;
      if (member?.id) {
        await createVoiceLog(oldState.channel, member.id, false);
        await handleMuteState(oldState.channel, member, false);
      }
    }
  } catch (error) {
    logger.error('onVoiceStateUpdate中にエラーが発生しました。', error);
  }
}
