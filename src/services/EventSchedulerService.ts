import { PrismaClient } from '@prisma/client';
import {
  ActionRowBuilder,
  ButtonBuilder,
  GuildScheduledEvent,
  GuildScheduledEventStatus,
} from 'discord.js';
import { config } from '../utils/config.js';
import { Job, scheduleJob } from 'node-schedule';
import log4js from 'log4js';
import eventOpPanelCommand from '../commands/event_op_command/EventOpPanelCommand.js';
import groupBy from 'lodash/groupBy.js';
import eventOpTodayCommand from '../commands/event_op_command/EventOpTodayCommand.js';
import PreparationStatusReportButtonAction from '../commands/action/preparation_status_command/PreparationStatusReportButtonAction.js';
import { client } from '../utils/client.js';
import eventManager, {
  eventIncludeHost,
  EventWithHost,
} from '../event/EventManager.js';
import { prisma } from '../utils/prisma.js';

/** スケジュール用ロガー */
export const loggerSchedule = log4js.getLogger('schedule');

/**
 * イベントスケジューラーサービス
 */
export class EventSchedulerService {
  /** スケジュールを格納する */
  private _schedules: Record<string, Job[]> = {};

  /**
   * node-scheduleを使ってパネルを出すスケジュールを更新する
   */
  async updateSchedules(): Promise<void> {
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
      for (const [_eventId, jobs] of Object.entries(this._schedules)) {
        jobs.forEach((job) => job?.cancel());
      }
      this._schedules = {};

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
          this._schedules[scheduledEvent.id] = jobs;
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
        this._schedules[date] = jobs;
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

            // 1〜4日前のリマインド/エスカレーション（単一ループ）
            for (const days of [4, 3, 2, 1]) {
              const targetDate = new Date(fireDate);
              targetDate.setDate(targetDate.getDate() + days);
              const rangeStart = new Date(targetDate);
              rangeStart.setHours(0, 0, 0, 0);
              const rangeEnd = new Date(targetDate);
              rangeEnd.setHours(23, 59, 59, 999);

              const targetEvents = await prisma.event.findMany({
                where: {
                  active: GuildScheduledEventStatus.Scheduled,
                  prepareStatus: false,
                  preparerId: { not: null },
                  scheduleTime: {
                    gte: rangeStart,
                    lte: rangeEnd,
                  },
                },
                ...eventIncludeHost,
              });

              loggerSchedule.info(
                `${days}日前リマインド対象: ${targetEvents.length}件`,
              );
              for (const event of targetEvents) {
                if (!event.preparer) continue;
                const unixTime = Math.floor(
                  (event.scheduleTime?.getTime() ?? 0) / 1000,
                );

                const isEscalation = days <= 2;
                const remindText = `「${event.name}」(ID: ${event.id}, 日付: <t:${unixTime}:D>) の準備が未完了です。(${days}日前のリマインドです)\n対応をご確認ください。`;
                const content = isEscalation
                  ? `<@&${config.remind_admin_role_id}> <@${event.preparer.userId}> ${remindText}`
                  : `<@${event.preparer.userId}> さん、${remindText}`;

                await contactChannel.send({
                  content,
                  components: [
                    new ActionRowBuilder<ButtonBuilder>().addComponents(
                      PreparationStatusReportButtonAction.create(),
                    ),
                  ],
                });

                loggerSchedule.info(
                  `${isEscalation ? '準備エスカレーション' : '準備リマインド'}(${days}日前)を送信しました: EventID=${event.id}, PreparerID=${event.preparer.userId}`,
                );
              }
            }
          } catch (error) {
            loggerSchedule.error('準備リマインドの送信に失敗しました:', error);
          }
        },
      );
      this._schedules['preparer-reminder'] = [preparerReminderJob];
      loggerSchedule.info(
        `準備リマインドのスケジュールを登録しました: ${preparerReminderJob.nextInvocation()?.toLocaleString()}`,
      );
    } catch (error) {
      loggerSchedule.error('スケジュールの更新に失敗しました:', error);
    }
  }
}

/**
 * イベントスケジューラーサービスのインスタンス
 */
export const eventSchedulerService = new EventSchedulerService();
