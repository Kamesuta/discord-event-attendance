import { Event, PrismaClient, User } from '@prisma/client';
import {
  ActionRowBuilder,
  ButtonBuilder,
  GuildScheduledEvent,
  GuildScheduledEventStatus,
  PartialGuildScheduledEvent,
  VoiceBasedChannel,
} from 'discord.js';
import { config } from './utils/config.js';
import { tallyAttendanceTime } from './event/attendance_time.js';
import { logger } from './utils/log.js';
import eventManager, {
  eventIncludeHost,
  EventWithHost,
} from './event/EventManager.js';
import { client } from './utils/client.js';
import { Job, scheduleJob } from 'node-schedule';
import log4js from 'log4js';
import eventOpPanelCommand from './commands/event_op_command/EventOpPanelCommand.js';
import groupBy from 'lodash/groupBy.js';
import userManager from './event/UserManager.js';
import eventOpTodayCommand from './commands/event_op_command/EventOpTodayCommand.js';
import PreparationStatusReportButtonAction from './commands/action/preparation_status_command/PreparationStatusReportButtonAction.js';

const prisma = new PrismaClient();

/**
 * イベントのカバー画像のサイズ
 */
const coverImageSize = 2048;

/**
 * スケジュールイベントが作成されたときのイベントハンドラー
 * @param scheduledEvent 作成されたイベント
 * @param host 主催者
 * @returns 作成されたイベント
 */
export async function onCreateScheduledEvent(
  scheduledEvent: GuildScheduledEvent,
  host?: User,
): Promise<EventWithHost | undefined> {
  if (!scheduledEvent.channel?.isVoiceBased()) {
    logger.warn(
      `VCが指定されていないイベントは無視します: ${scheduledEvent.name}`,
    );
    return;
  }

  try {
    const event = await prisma.event.create({
      data: {
        eventId: scheduledEvent.id,

        active: scheduledEvent.status,

        name: scheduledEvent.name,
        channelId: scheduledEvent.channel.id,
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

  // スケジュールを更新
  await updateSchedules();
}

/**
 * スケジュールイベントが開始されたときのイベントハンドラー
 * @param scheduledEvent 開始されたイベント
 * @returns 開始されたイベント
 */
export async function onStartScheduledEvent(
  scheduledEvent: GuildScheduledEvent,
): Promise<Event | undefined> {
  if (!scheduledEvent.channel?.isVoiceBased()) {
    logger.warn(
      `VCが指定されていないイベントは無視します: ${scheduledEvent.name}`,
    );
    return;
  }

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
          channelId: scheduledEvent.channel.id,
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
          channelId: scheduledEvent.channel.id,
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
    const members = Array.from(scheduledEvent.channel.members.values()).filter(
      (member) => !member.user.bot,
    );
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

    return event;
  } catch (error) {
    logger.error('イベントの開始に失敗しました:', error);
  }

  // スケジュールを更新
  await updateSchedules();
}

/**
 * イベント情報をDiscord側から取得して更新する
 * @param scheduledEvent イベント
 */
export async function onUpdateScheduledEvent(
  scheduledEvent: GuildScheduledEvent,
): Promise<void> {
  if (!scheduledEvent.channel?.isVoiceBased()) {
    logger.warn(
      `VCが指定されていないイベントは無視します: ${scheduledEvent.name}`,
    );
    return;
  }

  try {
    // イベント情報を取得
    const event = await eventManager.getEventFromDiscordId(scheduledEvent.id);
    if (!event) {
      throw new Error(`イベントが見つかりません: Name=${scheduledEvent.name}`);
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
        channelId: scheduledEvent.channel.id,
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

  // スケジュールを更新
  await updateSchedules();
}

/**
 * スケジュールイベントが終了されたときのイベントハンドラー
 * @param scheduledEvent 終了されたイベント
 * @returns 終了されたイベント
 */
export async function onEndScheduledEvent(
  scheduledEvent: GuildScheduledEvent | PartialGuildScheduledEvent,
): Promise<void> {
  try {
    const event = await eventManager.getEventFromDiscordId(scheduledEvent.id);
    if (!event) {
      logger.warn(`イベントが見つかりません: Name=${scheduledEvent.name}`);
      return;
    }
    await onEndEvent(event, scheduledEvent.channel ?? undefined);
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
export async function onEndEvent(
  event: Event,
  channel?: VoiceBasedChannel,
): Promise<void> {
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
      await tallyAttendanceTime(event.id, user, new Date());

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

  // スケジュールを更新
  await updateSchedules();
}

/**
 * スケジュールイベントが作成されたときのイベントハンドラー
 * @param scheduledEvent 作成されたイベント
 */
export async function onGuildScheduledEventCreate(
  scheduledEvent: GuildScheduledEvent,
): Promise<void> {
  try {
    // 指定のサーバー以外無視
    if (scheduledEvent.guild?.id !== config.guild_id) {
      return;
    }

    // イベントBOTの操作を無視
    if (scheduledEvent.creatorId === client.user?.id) {
      return;
    }

    await onCreateScheduledEvent(scheduledEvent);
  } catch (error) {
    logger.error(
      'onGuildScheduledEventCreate中にエラーが発生しました。',
      error,
    );
  }
}

/**
 * スケジュールイベントが更新されたときのイベントハンドラー
 * @param oldScheduledEvent 更新前のイベント
 * @param newScheduledEvent 更新後のイベント
 */
export async function onGuildScheduledEventUpdate(
  oldScheduledEvent: GuildScheduledEvent | PartialGuildScheduledEvent | null,
  newScheduledEvent: GuildScheduledEvent,
): Promise<void> {
  try {
    if (!oldScheduledEvent) return;

    // 指定のサーバー以外無視
    if (newScheduledEvent.guild?.id !== config.guild_id) {
      return;
    }

    if (!oldScheduledEvent.isActive() && newScheduledEvent.isActive()) {
      // イベントの開始処理
      await onStartScheduledEvent(newScheduledEvent);
    } else if (oldScheduledEvent.isActive() && !newScheduledEvent.isActive()) {
      // イベントの終了処理
      await onEndScheduledEvent(newScheduledEvent);
      if (newScheduledEvent.status === GuildScheduledEventStatus.Scheduled) {
        // 繰り返しイベントが終了した場合、Scheduled状態に変更されるため、その場合は新しいイベントを登録する
        await onCreateScheduledEvent(newScheduledEvent);
      }
    }
    // イベント情報を更新
    await onUpdateScheduledEvent(newScheduledEvent);
  } catch (error) {
    logger.error(
      'onGuildScheduledEventUpdate中にエラーが発生しました。',
      error,
    );
  }
}

/**
 * スケジュールイベントが削除されたときのイベントハンドラー
 * @param oldScheduledEvent 更新前のイベント
 */
export async function onGuildScheduledEventDelete(
  oldScheduledEvent: GuildScheduledEvent | PartialGuildScheduledEvent,
): Promise<void> {
  try {
    if (!oldScheduledEvent) return;

    // 指定のサーバー以外無視
    if (oldScheduledEvent.guild?.id !== config.guild_id) {
      return;
    }

    // イベント情報を更新
    if (!oldScheduledEvent.partial) {
      await onUpdateScheduledEvent(oldScheduledEvent);
    }

    // イベント情報取得
    const event = await eventManager.getEventFromDiscordId(
      oldScheduledEvent.id,
    );
    if (!event) {
      logger.warn(`イベントが見つかりません: Name=${oldScheduledEvent.name}`);
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
  } catch (error) {
    logger.error(
      'onGuildScheduledEventUpdate中にエラーが発生しました。',
      error,
    );
  }
}

/** スケジュール用ロガー */
export const loggerSchedule = log4js.getLogger('schedule');

// スケジュールを格納する
let schedules: Record<string, Job[]> = {};

/**
 * node-scheduleを使ってパネルを出すスケジュールを更新する
 */
export async function updateSchedules(): Promise<void> {
  try {
    // ログを出力
    loggerSchedule.info('↓スケジュールを更新します');

    // まず、すべてのDiscordに登録されているスケジュールを取得
    // そして、それをnode-scheduleに登録する
    // schedulesには、DiscordのイベントIDをキーにして、node-scheduleのJobを格納する
    // schedulesに登録されていて、Discordに登録されていないスケジュールはキャンセルする

    // Discordに登録されているスケジュールを取得
    const guild = await client.guilds.fetch(config.guild_id);
    const scheduledEvents = await guild.scheduledEvents.fetch();

    // イベントを取得
    const eventList: [GuildScheduledEvent, EventWithHost | undefined][] =
      await Promise.all(
        scheduledEvents.map(async (discordEvent) => {
          const event = await eventManager.getEventFromDiscordId(
            discordEvent.id,
          );
          return [discordEvent, event ?? undefined];
        }),
      );

    // すべてのスケジュールはキャンセル
    for (const [_eventId, jobs] of Object.entries(schedules)) {
      jobs.forEach((job) => job?.cancel());
    }
    schedules = {};

    // Discordに登録されているスケジュールを登録
    for (const [scheduledEvent, event] of eventList) {
      if (
        // !schedules[scheduledEvent.id] &&
        event?.hostId &&
        scheduledEvent.scheduledStartAt
      ) {
        const jobs: Job[] = [];

        // パネルを出す時間 = イベント開始時間 - 3時間
        const panelDate = new Date(scheduledEvent.scheduledStartAt);
        panelDate.setHours(panelDate.getHours() - 3);
        jobs.push(
          scheduleJob(panelDate, async () => {
            try {
              // ログを出力
              loggerSchedule.info(
                `操作パネルを表示します: ID=${event.id}, PanelDate=${panelDate.toLocaleString()}, Name=${scheduledEvent.name}`,
              );

              // パネルを出すチャンネルを取得
              const channel = await guild.channels
                .fetch(config.event_panel_channel_id)
                .catch(() => undefined);
              if (!channel?.isTextBased()) {
                loggerSchedule.warn('パネルを出すチャンネルが見つかりません');
                return;
              }

              // パネルを出す
              await channel.send(
                eventOpPanelCommand.createPanel(scheduledEvent, event),
              );
            } catch (error) {
              loggerSchedule.error('操作パネルの表示に失敗しました:', error);
            }
          }),
        );

        // リマインドを出す時間 = イベント開始時間 - 1時間
        const remindDate = new Date(scheduledEvent.scheduledStartAt);
        remindDate.setHours(remindDate.getHours() - 1);
        jobs.push(
          scheduleJob(remindDate, async () => {
            try {
              // ログを出力
              loggerSchedule.info(
                `リマインドを表示します: ID=${event.id}, RemindDate=${remindDate.toLocaleString()}, Name=${scheduledEvent.name}`,
              );

              // リマインドを出すチャンネルを取得
              const channel = await guild.channels
                .fetch(config.event_contact_channel_id)
                .catch(() => undefined);
              if (!channel?.isTextBased()) {
                loggerSchedule.warn(
                  'リマインドを出すチャンネルが見つかりません',
                );
                return;
              }

              // リマインドを出す
              await channel.send(
                `<@${event.host?.userId}> 今日の <t:${(scheduledEvent.scheduledStartTimestamp ?? 0) / 1000}:R> にイベント「${scheduledEvent.name}」があるんだけど、主催できそう？\nやり方は https://discord.com/channels/${config.guild_id}/${config.event_panel_channel_id} の上の方に書いてある～`,
              );
            } catch (error) {
              loggerSchedule.error('リマインドの送信に失敗しました:', error);
            }
          }),
        );

        // ログを出力
        loggerSchedule.info(
          `スケジュールを登録しました: ID=${event.id}, PanelDate=${panelDate.toLocaleString()}, RemindDate=${remindDate.toLocaleString()}, Name=${scheduledEvent.name}`,
        );
        schedules[scheduledEvent.id] = jobs;
      }
    }

    // 未登録イベント以外を取得
    const registeredEventList = eventList.filter(
      ([_scheduledEvent, event]) => event,
    ) as [GuildScheduledEvent, EventWithHost][]; // 未登録イベントは除外
    // 日付ずつに分ける
    const groupByDate = groupBy(registeredEventList, ([scheduledEvent]) =>
      scheduledEvent.scheduledStartAt?.toLocaleDateString('ja-JP'),
    );
    // 日付ごとにスケジュールを登録
    for (const [date, events] of Object.entries(groupByDate)) {
      const jobs: Job[] = [];
      // その日の9時
      const remindDate = new Date(date);
      remindDate.setHours(9, 0, 0, 0);
      // アナウンスチャンネルに1日分のイベントを表示
      jobs.push(
        scheduleJob(remindDate, async () => {
          // アナウンスチャンネルを取得
          const channel = await guild.channels
            .fetch(config.schedule_channel_id)
            .catch(() => undefined);
          if (!channel?.isTextBased()) {
            loggerSchedule.warn('アナウンスチャンネルが見つかりません');
            return;
          }

          // その日のイベントをまとめて渡す
          await eventOpTodayCommand.showTodayMessage(channel, events);
        }),
      );

      // ログを出力
      loggerSchedule.info(
        `本日のイベント予定スケジュールを登録しました: RemindDate=${remindDate.toLocaleString()}`,
      );
      schedules[date] = jobs;
    }

    // ログを出力
    loggerSchedule.info('↑スケジュールを更新しました');

    // 準備リマインドのスケジュールを登録
    const preparerReminderJob = scheduleJob(
      { rule: '0 18 * * *', tz: 'Asia/Tokyo' },
      async (fireDate) => {
        loggerSchedule.info('準備リマインドのジョブを実行します');
        try {
          const contactChannel = await guild.channels
            .fetch(config.event_contact_channel_id)
            .catch(() => undefined);
          if (!contactChannel?.isTextBased()) {
            loggerSchedule.warn('リマインドを出すチャンネルが見つかりません');
            return;
          }

          // 4日前と3日前のリマインド
          for (const days of [4, 3]) {
            const reminderTargetDate = new Date(fireDate);
            reminderTargetDate.setDate(reminderTargetDate.getDate() + days);
            const reminderStart = new Date(reminderTargetDate);
            reminderStart.setHours(0, 0, 0, 0);
            const reminderEnd = new Date(reminderTargetDate);
            reminderEnd.setHours(23, 59, 59, 999);

            const reminderEvents = await prisma.event.findMany({
              where: {
                active: GuildScheduledEventStatus.Scheduled,
                prepareStatus: false,
                preparerId: { not: null },
                scheduleTime: {
                  gte: reminderStart,
                  lte: reminderEnd,
                },
              },
              include: {
                preparer: true,
              },
            });

            loggerSchedule.info(
              `${days}日前リマインド対象: ${reminderEvents.length}件`,
            );
            for (const event of reminderEvents) {
              if (!event.preparer) continue;
              const unixTime = Math.floor(
                (event.scheduleTime?.getTime() ?? 0) / 1000,
              );
              const message = `<@${event.preparer.userId}> さん、「${event.name}」(ID: ${event.id}, 日付: <t:${unixTime}:D>) の準備状況が未完了です。(${days}日前のリマインドです)`;
              await contactChannel.send({
                content: message,
                allowedMentions: { users: [event.preparer.userId] },
                components: [
                  new ActionRowBuilder<ButtonBuilder>().addComponents(
                    PreparationStatusReportButtonAction.create(),
                  ),
                ],
              });
              loggerSchedule.info(
                `準備リマインド(${days}日前)を送信しました: EventID=${event.id}, PreparerID=${event.preparer.userId}`,
              );
            }
          }

          // 2日前のエスカレーション
          const escalationTargetDate = new Date(fireDate);
          escalationTargetDate.setDate(escalationTargetDate.getDate() + 2);
          const escalationStart = new Date(escalationTargetDate);
          escalationStart.setHours(0, 0, 0, 0);
          const escalationEnd = new Date(escalationTargetDate);
          escalationEnd.setHours(23, 59, 59, 999);

          const escalationEvents = await prisma.event.findMany({
            where: {
              active: GuildScheduledEventStatus.Scheduled,
              prepareStatus: false,
              preparerId: { not: null },
              scheduleTime: {
                gte: escalationStart,
                lte: escalationEnd,
              },
            },
          });

          loggerSchedule.info(
            `2日前エスカレーション対象: ${escalationEvents.length}件`,
          );
          for (const event of escalationEvents) {
            const unixTime = Math.floor(
              (event.scheduleTime?.getTime() ?? 0) / 1000,
            );
            const message = `管理者各位: 「${event.name}」(ID: ${event.id}, 日付: <t:${unixTime}:D>) の準備が未完了です。対応をご確認ください。`;
            await contactChannel.send({
              content: message,
              allowedMentions: { users: [] },
            });
            loggerSchedule.info(
              `準備エスカレーションを送信しました: EventID=${event.id}`,
            );
          }
        } catch (error) {
          loggerSchedule.error('準備リマインドの送信に失敗しました:', error);
        }
      },
    );
    schedules['preparer-reminder'] = [preparerReminderJob];
    loggerSchedule.info(
      `準備リマインドのスケジュールを登録しました: ${preparerReminderJob.nextInvocation()?.toLocaleString()}`,
    );
  } catch (error) {
    loggerSchedule.error('スケジュールの更新に失敗しました:', error);
  }
}
