import { EmbedBuilder, TextChannel } from 'discord.js';
import { client } from '../utils/client.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/log.js';
import { prisma } from '../utils/prisma.js';
import { Event } from '@prisma/client';

/**
 * 主催者お伺いワークフロー用スケジューラー
 * 週次で主催者お伺いパネルの表示を管理
 */
export class HostRequestScheduler {
  /**
   * 週次パネル表示を実行
   * @returns Promise<void>
   */
  async executeWeeklyPanel(): Promise<void> {
    try {
      logger.info('週次主催者お伺いパネル表示を開始');

      // 管理チャンネルを取得
      const channel = await this._getManagementChannel();
      if (!channel) {
        logger.error('主催者お伺い管理チャンネルが見つかりません');
        return;
      }

      // 主催者が決まっていないイベントを取得
      const eventsWithoutHost = await this._getEventsWithoutHostForWeek();

      if (eventsWithoutHost.length === 0) {
        // 主催者が決まっていないイベントがない場合も通知
        await this._sendNoEventsMessage(channel);
        return;
      }

      // 週次パネルを送信
      await this._sendWeeklyPanel(channel, eventsWithoutHost);

      logger.info(
        `週次主催者お伺いパネルを表示しました: ${eventsWithoutHost.length}件のイベント`,
      );
    } catch (error) {
      logger.error('週次パネル表示でエラー:', error);
    }
  }

  /**
   * 管理チャンネルを取得
   * @returns Promise<TextChannel | null>
   */
  private async _getManagementChannel(): Promise<TextChannel | null> {
    try {
      const channel = await client.channels.fetch(
        config.host_request_channel_id,
      );
      if (channel?.isTextBased() && 'threads' in channel) {
        return channel as TextChannel;
      }
      return null;
    } catch (error) {
      logger.error('管理チャンネルの取得でエラー:', error);
      return null;
    }
  }

  /**
   * 来週の主催者未決定イベントを取得
   * @returns Promise<Event[]>
   */
  private async _getEventsWithoutHostForWeek(): Promise<Event[]> {
    // 来週の期間を計算
    const now = new Date();
    const startOfNextWeek = new Date(now);
    startOfNextWeek.setDate(now.getDate() + (7 - now.getDay())); // 次の日曜日
    startOfNextWeek.setHours(0, 0, 0, 0);

    const endOfNextWeek = new Date(startOfNextWeek);
    endOfNextWeek.setDate(startOfNextWeek.getDate() + 7); // 次の土曜日の終わり

    const events = await prisma.event.findMany({
      where: {
        active: {
          in: [1, 2], // Scheduled, Active
        },
        hostId: null, // 主催者が決まっていない
        scheduleTime: {
          gte: startOfNextWeek,
          lt: endOfNextWeek,
        },
      },
      orderBy: {
        scheduleTime: 'asc',
      },
    });

    return events;
  }

  /**
   * 週次パネルメッセージを送信
   * @param channel 送信先チャンネル
   * @param events 対象イベント一覧
   * @returns Promise<void>
   */
  private async _sendWeeklyPanel(
    channel: TextChannel,
    events: Event[],
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('📅 週次主催者お伺いワークフロー')
      .setDescription(
        '来週のイベントで主催者が決まっていないものが見つかりました。\n' +
          '主催者お伺いワークフローの計画を作成してください。\n\n' +
          '**操作方法:**\n' +
          '• `/event_host plan` コマンドで詳細な計画を作成\n' +
          '• 各イベントの依頼順序や公募設定が可能\n' +
          '• 自動でDM送信・進捗管理が行われます',
      )
      .setColor(0xff9500)
      .setTimestamp();

    // イベント一覧を表示
    if (events.length > 0) {
      const eventListText = events
        .map((event) => {
          const dateStr = event.scheduleTime
            ? `<t:${Math.floor(event.scheduleTime.getTime() / 1000)}:F>`
            : '未定';
          return `• **${event.name}** - ${dateStr}`;
        })
        .join('\n');

      embed.addFields({
        name: `🎯 主催者未決定イベント (${events.length}件)`,
        value:
          eventListText.length > 1024
            ? eventListText.substring(0, 1021) + '...'
            : eventListText,
        inline: false,
      });
    }

    // 統計情報を追加
    const nextWeekStart = new Date();
    nextWeekStart.setDate(
      nextWeekStart.getDate() + (7 - nextWeekStart.getDay()),
    );
    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekStart.getDate() + 6);

    embed.addFields(
      {
        name: '📊 対象期間',
        value: `<t:${Math.floor(nextWeekStart.getTime() / 1000)}:D> ～ <t:${Math.floor(nextWeekEnd.getTime() / 1000)}:D>`,
        inline: true,
      },
      {
        name: '⚙️ 設定',
        value: `タイムアウト: ${config.host_request_timeout_hours}時間\n表示頻度: 週次 (${this._getDayName(config.host_request_schedule_day)} ${config.host_request_schedule_time})`,
        inline: true,
      },
    );

    // フッターに操作方法を記載
    embed.setFooter({
      text: '💡 /event_host コマンドで詳細な操作が可能です',
    });

    await channel.send({
      embeds: [embed],
    });
  }

  /**
   * 主催者未決定イベントがない場合のメッセージを送信
   * @param channel 送信先チャンネル
   * @returns Promise<void>
   */
  private async _sendNoEventsMessage(channel: TextChannel): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('✅ 週次主催者お伺いワークフロー')
      .setDescription(
        '来週のイベントは全て主催者が決まっています！\n' +
          'お疲れ様でした。今週も楽しいイベントをお楽しみください。',
      )
      .setColor(0x00ff00)
      .setTimestamp();

    const nextWeekStart = new Date();
    nextWeekStart.setDate(
      nextWeekStart.getDate() + (7 - nextWeekStart.getDay()),
    );
    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekStart.getDate() + 6);

    embed.addFields({
      name: '📊 対象期間',
      value: `<t:${Math.floor(nextWeekStart.getTime() / 1000)}:D> ～ <t:${Math.floor(nextWeekEnd.getTime() / 1000)}:D>`,
      inline: false,
    });

    embed.setFooter({
      text: '来週も引き続きよろしくお願いします！',
    });

    await channel.send({
      embeds: [embed],
    });
  }

  /**
   * 曜日番号から曜日名を取得
   * @param dayNumber 曜日番号 (0=日曜)
   * @returns 曜日名
   */
  private _getDayName(dayNumber: number): string {
    const days = [
      '日曜日',
      '月曜日',
      '火曜日',
      '水曜日',
      '木曜日',
      '金曜日',
      '土曜日',
    ];
    return days[dayNumber] || '不明';
  }

  /**
   * 次回の実行時刻を計算
   * @returns Date
   */
  getNextExecutionTime(): Date {
    const now = new Date();
    const [hours, minutes] = config.host_request_schedule_time
      .split(':')
      .map(Number);

    // 次回の実行日を計算
    const nextExecution = new Date(now);
    nextExecution.setHours(hours, minutes, 0, 0);

    // 指定の曜日まで進める
    const daysUntilTarget =
      (config.host_request_schedule_day + 7 - now.getDay()) % 7;
    if (daysUntilTarget === 0 && nextExecution <= now) {
      // 今日が対象曜日だが実行時刻を過ぎている場合は来週
      nextExecution.setDate(nextExecution.getDate() + 7);
    } else {
      nextExecution.setDate(nextExecution.getDate() + daysUntilTarget);
    }

    return nextExecution;
  }
}

/**
 * HostRequestSchedulerのインスタンス
 */
export const hostRequestScheduler = new HostRequestScheduler();

export default new HostRequestScheduler();
