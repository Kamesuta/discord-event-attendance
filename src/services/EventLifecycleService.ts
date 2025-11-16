import { Event, PrismaClient, User } from '@prisma/client';
import {
  GuildScheduledEvent,
  GuildScheduledEventStatus,
  PartialGuildScheduledEvent,
  VoiceBasedChannel,
} from 'discord.js';
import { config } from '../utils/config.js';
import { attendanceService } from './AttendanceService.js';
import { logger } from '../utils/log.js';
import eventManager, {
  eventIncludeHost,
  EventWithHost,
} from '../event/EventManager.js';
import { client } from '../utils/client.js';
import userManager from '../event/UserManager.js';
import { prisma } from '../utils/prisma.js';

/**
 * イベントのカバー画像のサイズ
 */
const coverImageSize = 2048;

/**
 * イベントライフサイクル管理サービス
 */
export class EventLifecycleService {
  /**
   * スケジュールイベントが作成されたときのイベントハンドラー
   * @param scheduledEvent 作成されたイベント
   * @param host 主催者
   * @returns 作成されたイベント
   */
  async onCreateScheduledEvent(
    scheduledEvent: GuildScheduledEvent,
    host?: User,
  ): Promise<EventWithHost | undefined> {
    // VCイベントまたは外部イベント（テキストイベント）を受け入れる
    const channelId =
      scheduledEvent.channel?.id ?? config.text_event_channel_id;

    try {
      const event = await prisma.event.create({
        data: {
          eventId: scheduledEvent.id,

          active: scheduledEvent.status,

          name: scheduledEvent.name,
          channelId: channelId,
          description: eventManager.formatEventDescription(
            scheduledEvent.description,
          ),
          coverImage: scheduledEvent.coverImageURL({ size: coverImageSize }),
          scheduleTime: scheduledEvent.scheduledStartAt,
          hostId: host?.id,
        },
        ...eventIncludeHost,
      });

      // Discordイベントの説明文を更新
      await eventManager.updateEventDescription(scheduledEvent, event);

      logger.info(
        `イベントを作成しました: ID=${event.id}, Name=${scheduledEvent.name}`,
      );
      return event;
    } catch (error) {
      logger.error('イベントの作成に失敗しました:', error);
    }
  }

  /**
   * スケジュールイベントが開始されたときのイベントハンドラー
   * @param scheduledEvent 開始されたイベント
   * @returns 開始されたイベント
   */
  async onStartScheduledEvent(
    scheduledEvent: GuildScheduledEvent,
  ): Promise<Event | undefined> {
    // VCイベントまたは外部イベント（テキストイベント）を受け入れる
    const channelId =
      scheduledEvent.channel?.id ?? config.text_event_channel_id;

    try {
      // イベント情報を取得
      let event = await eventManager.getEventFromDiscordId(scheduledEvent.id);
      if (!event) {
        event = await prisma.event.create({
          data: {
            eventId: scheduledEvent.id,

            active: GuildScheduledEventStatus.Active,
            startTime: new Date(),

            name: scheduledEvent.name,
            channelId: channelId,
            description: eventManager.formatEventDescription(
              scheduledEvent.description,
            ),
            coverImage: scheduledEvent.coverImageURL({ size: coverImageSize }),
            scheduleTime: scheduledEvent.scheduledStartAt,
          },
          ...eventIncludeHost,
        });
      } else {
        event = await prisma.event.update({
          where: {
            id: event.id,
          },
          data: {
            active: GuildScheduledEventStatus.Active,
            startTime: new Date(),

            name: scheduledEvent.name,
            channelId: channelId,
            description: eventManager.formatEventDescription(
              scheduledEvent.description,
            ),
            coverImage: scheduledEvent.coverImageURL({ size: coverImageSize }),
            scheduleTime: scheduledEvent.scheduledStartAt,
          },
          ...eventIncludeHost,
        });

        // Discordイベントの説明文を更新
        await eventManager.updateEventDescription(scheduledEvent, event);
      }
      logger.info(
        `イベントを開始しました: ID=${event.id}, Name=${scheduledEvent.name}`,
      );

      // 主催者にロールを付与
      if (event.host) {
        const guild = await client.guilds.fetch(config.guild_id);
        const member = await guild.members.fetch(event.host.userId);
        await member.roles.add(config.host_role_id);
        logger.info(`主催者(${event.host.userId})にロールを付与しました`);
      }

      // VCに既に参加しているユーザーに対してもログを記録する (Botは無視)
      // テキストイベントの場合はチャンネルがないのでスキップ
      if (scheduledEvent.channel?.isVoiceBased()) {
        const members = Array.from(
          scheduledEvent.channel.members.values(),
        ).filter((member) => !member.user.bot);
        // ユーザーを作成
        const users = await Promise.all(
          members.map((member) => userManager.getOrCreateUser(member)),
        );
        // ユーザーStatを初期化
        await prisma.userStat.createMany({
          data: users.map((user) => ({
            eventId: event.id,
            userId: user.id,
            duration: 0,
          })),
        });
        // VC参加ログを記録する
        await prisma.voiceLog.createMany({
          data: users.map((user) => ({
            eventId: event.id,
            userId: user.id,
            join: true,
          })),
        });
      }

      return event;
    } catch (error) {
      logger.error('イベントの開始に失敗しました:', error);
    }
  }

  /**
   * イベント情報をDiscord側から取得して更新する
   * @param scheduledEvent イベント
   */
  async onUpdateScheduledEvent(
    scheduledEvent: GuildScheduledEvent,
  ): Promise<void> {
    // VCイベントまたは外部イベント（テキストイベント）を受け入れる
    const channelId =
      scheduledEvent.channel?.id ?? config.text_event_channel_id;

    try {
      // イベント情報を取得
      const event = await eventManager.getEventFromDiscordId(scheduledEvent.id);
      if (!event) {
        throw new Error(
          `イベントが見つかりません: Name=${scheduledEvent.name}`,
        );
      }

      // Discordイベントを更新
      await eventManager.updateEventDescription(scheduledEvent, event);

      await prisma.event.update({
        where: {
          id: event.id,
        },
        data: {
          active: scheduledEvent.status,

          name: scheduledEvent.name,
          channelId: channelId,
          description: eventManager.formatEventDescription(
            scheduledEvent.description,
            event,
          ),
          coverImage: scheduledEvent.coverImageURL({ size: coverImageSize }),
          scheduleTime: scheduledEvent.scheduledStartAt,
        },
      });
      logger.info(`イベント情報を更新しました: Name=${scheduledEvent.name}`);
    } catch (error) {
      logger.error('イベント情報の更新に失敗しました:', error);
    }
  }

  /**
   * スケジュールイベントが終了されたときのイベントハンドラー
   * @param scheduledEvent 終了されたイベント
   * @returns 終了されたイベント
   */
  async onEndScheduledEvent(
    scheduledEvent: GuildScheduledEvent | PartialGuildScheduledEvent,
  ): Promise<void> {
    try {
      const event = await eventManager.getEventFromDiscordId(scheduledEvent.id);
      if (!event) {
        logger.warn(`イベントが見つかりません: Name=${scheduledEvent.name}`);
        return;
      }
      await this.onEndEvent(event, scheduledEvent.channel ?? undefined);
      logger.info(`イベントを終了しました: Name=${scheduledEvent.name}`);
    } catch (error) {
      logger.error('イベントの終了に失敗しました:', error);
    }
  }

  /**
   * イベントを終了する
   * @param event 終了されたイベント
   * @param channel VCチャンネル
   * @returns 終了されたイベント
   */
  async onEndEvent(event: Event, channel?: VoiceBasedChannel): Promise<void> {
    // データベースを更新
    await prisma.event.update({
      where: {
        id: event.id,
      },
      data: {
        active: GuildScheduledEventStatus.Completed,
        endTime: new Date(),
      },
    });

    // 全員から主催者ロールを削除
    try {
      const guild = await client.guilds.fetch(config.guild_id);
      const role = await guild.roles.fetch(config.host_role_id);
      if (role) {
        const members = role.members;
        for (const [_, member] of members) {
          await member.roles.remove(config.host_role_id);
          logger.info(`ユーザー(${member.id})から主催者ロールを削除しました`);
        }
      }
    } catch (error) {
      logger.error('主催者ロールの削除に失敗しました:', error);
    }

    if (channel) {
      // VCに参加しているユーザーに対してもログを記録する (Botは無視)
      const members = Array.from(channel.members.values()).filter(
        (member) => !member.user.bot,
      );
      for (const member of members) {
        // ユーザーを作成
        const user = await userManager.getOrCreateUser(member);
        // ユーザー情報を初期化 (初期化されていない人がいる可能性があるためここで初期化)
        await prisma.userStat.upsert({
          where: {
            id: {
              eventId: event.id,
              userId: user.id,
            },
          },
          create: {
            eventId: event.id,
            userId: user.id,
            duration: 0,
          },
          update: {},
        });
        // VC参加ログを記録する
        await prisma.voiceLog.create({
          data: {
            eventId: event.id,
            userId: user.id,
            join: false,
          },
        });
        // 参加時間を集計する
        await attendanceService.tallyAttendanceTime(event.id, user, new Date());

        // 最新のミュート状態を取得
        const latestMute = await prisma.userMute.findFirst({
          where: {
            userId: user.id,
          },
          orderBy: {
            time: 'desc',
          },
        });

        // ミュートフラグが立っている場合は解除して記録
        if (latestMute?.muted) {
          await member.voice.setMute(false, 'イベント終了のためミュート解除');
          await prisma.userMute.create({
            data: {
              userId: user.id,
              eventId: event.id,
              muted: false,
            },
          });
          logger.info(
            `ユーザー(${user.id})のミュートを解除しました (イベント終了)`,
          );
        }
      }
    }
  }

  /**
   * スケジュールイベントが削除されたときの処理
   * @param scheduledEvent 削除されたイベント
   */
  async onGuildScheduledEventDelete(
    scheduledEvent: GuildScheduledEvent | PartialGuildScheduledEvent,
  ): Promise<void> {
    // イベント情報を更新
    if (!scheduledEvent.partial) {
      await this.onUpdateScheduledEvent(scheduledEvent);
    }

    // イベント情報取得
    const event = await eventManager.getEventFromDiscordId(scheduledEvent.id);
    if (!event) {
      logger.warn(`イベントが見つかりません: Name=${scheduledEvent.name}`);
      return;
    }

    // イベントのキャンセル処理
    await prisma.event.update({
      where: {
        id: event.id,
      },
      data: {
        active: GuildScheduledEventStatus.Canceled,
      },
    });
  }
}

/**
 * イベントライフサイクルサービスのインスタンス
 */
export const eventLifecycleService = new EventLifecycleService();
