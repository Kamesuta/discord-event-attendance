import { VoiceBasedChannel, VoiceState } from 'discord.js';
import { prisma } from './index.js';
import { config } from './utils/config.js';

// 入退室ログを記録します
async function createVoiceLog(
  channel: VoiceBasedChannel,
  userId: string,
  join: boolean
): Promise<void> {
  // 指定のサーバー以外無視
  if (channel.guild.id !== config.guild_id) {
    return;
  }

  // イベント開催中のボイスチャンネルにいるかどうかを確認する
  const event = await prisma.event.findFirst({
    where: {
      channelId: channel.id,
      active: true,
    },
  });
  if (!event) {
    return;
  }

  // ログを記録する
  try {
    await prisma.voiceLog.create({
      data: {
        eventId: event.id,
        userId,
        join,
      },
    });
    console.log(
      `ユーザー(${userId})がイベント(ID:${event.id},Name:${event.name})に${
        join ? '参加' : '退出'
      }しました。`
    );
  } catch (error) {
    console.error('ログの記録に失敗しました。', error);
  }
}

/**
 * 入退室時のイベントハンドラー
 * @param oldState 前の状態
 * @param newState 新しい状態
 */
export async function onVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState
): Promise<void> {
  if (oldState.channel === newState.channel) return;

  if (newState.channel) {
    // ユーザーがボイスチャンネルに参加たとき
    const userId = newState.member?.id;
    if (userId) {
      await createVoiceLog(newState.channel, userId, true);
    }
  } else if (oldState.channel) {
    // ユーザーがボイスチャンネルから退出したとき
    const userId = oldState.member?.id;
    if (userId) {
      await createVoiceLog(oldState.channel, userId, false);
    }
  }
}
