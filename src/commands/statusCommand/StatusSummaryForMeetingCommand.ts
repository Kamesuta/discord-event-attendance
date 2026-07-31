import {
  ChatInputCommandInteraction,
  GuildScheduledEventStatus,
  MessageFlags,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '@/commands/base/commandBase';
import { parsePeriod, type Period } from '@/domain/parsers/periodParser';
import { prisma } from '@/utils/prisma';
import { statusCommand } from './StatusCommand';

interface MeetingEvent {
  startTime: Date | null;
  stats: {
    userId: number;
  }[];
}

interface MeetingSummary {
  eventCount: number;
  uniqueParticipantCount: number;
  totalParticipantCount: number;
  frequentParticipantCount: number;
  occasionalParticipantCount: number;
  monthlyParticipantCount: number;
  continuingParticipantCount: number;
}

/**
 * Dateが有効な日時を表しているか確認する
 * @param date 確認する日時
 * @returns 有効な日時ならtrue
 */
function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

/**
 * 指定した日時の1か月前を取得する
 * 月末日は前月に存在する最終日に丸める
 * @param date 基準日時
 * @returns 1か月前の日時
 */
function getPreviousMonthDate(date: Date): Date {
  const previousMonth = date.getMonth() - 1;
  const lastDateOfPreviousMonth = new Date(
    date.getFullYear(),
    previousMonth + 1,
    0,
  ).getDate();

  return new Date(
    date.getFullYear(),
    previousMonth,
    Math.min(date.getDate(), lastDateOfPreviousMonth),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
}

/**
 * MySQLのDATE_FORMAT(date, '%x-%v')と同じISO週のキーを取得する
 * @param date 対象日時
 * @returns ISO週年と週番号を連結したキー
 */
function getIsoWeekKey(date: Date): string {
  // 時刻やサマータイムの影響を避けるため、UTCの日付として週番号を計算する
  const targetDate = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNumber = targetDate.getUTCDay() || 7;

  // ISO週が属する年は、その週の木曜日が属する年と同じになる
  targetDate.setUTCDate(targetDate.getUTCDate() + 4 - dayNumber);
  const isoWeekYear = targetDate.getUTCFullYear();
  const firstDateOfYear = new Date(Date.UTC(isoWeekYear, 0, 1));
  const isoWeekNumber = Math.ceil(
    ((targetDate.getTime() - firstDateOfYear.getTime()) / 86_400_000 + 1) / 7,
  );

  return `${isoWeekYear}-${isoWeekNumber.toString().padStart(2, '0')}`;
}

class StatusSummaryForMeetingCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('summary-for-meeting')
    .setDescription('定例会用のイベント参加統計を取得')
    .addStringOption((option) =>
      option
        .setName('period')
        .setDescription('今期の期間（例: 2026/6-2026/7）')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('prev-period')
        .setDescription('前期の期間（例: 2026/4-2026/5）')
        .setRequired(true),
    );

  /** @inheritdoc */
  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // 集計結果は会議資料へ貼り付ける用途のため、まず非公開で返す
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // 今期と前期の期間指定を解析する
    const period = parsePeriod(interaction.options.getString('period', true));
    const previousPeriod = parsePeriod(
      interaction.options.getString('prev-period', true),
    );

    // 定例会用集計には開始日時と終了日時の両方が必要
    if (
      !this._isBoundedPeriod(period) ||
      !this._isBoundedPeriod(previousPeriod)
    ) {
      await interaction.editReply(
        '期間を解釈できませんでした。例: `2026/6-2026/7`',
      );
      return;
    }

    // 独立した2期間の集計は並列に取得する
    const [summary, previousSummary] = await Promise.all([
      this._getSummary(period),
      this._getSummary(previousPeriod),
    ]);

    // Discord上でそのままコピーできるよう、指定された文章をコードブロックで返す
    await interaction.editReply(this._formatSummary(summary, previousSummary));
  }

  /**
   * 期間に有効な開始日時と終了日時があるか確認する
   * @param period 確認する期間
   * @returns 集計可能な期間ならtrue
   */
  private _isBoundedPeriod(
    period: Period,
  ): period is Period & { period: { gte: Date; lt: Date } } {
    return Boolean(
      period.period &&
        isValidDate(period.period.gte) &&
        isValidDate(period.period.lt) &&
        period.period.gte < period.period.lt,
    );
  }

  /**
   * 1期間分の定例会用統計を取得する
   * @param period 集計期間
   * @returns 定例会用統計
   */
  private async _getSummary(
    period: Period & { period: { gte: Date; lt: Date } },
  ): Promise<MeetingSummary> {
    // 既存の統計コマンドと同様に、完了済みイベントだけを対象にする
    const events: MeetingEvent[] = await prisma.event.findMany({
      where: {
        active: GuildScheduledEventStatus.Completed,
        startTime: period.period,
      },
      select: {
        startTime: true,
        stats: {
          where: {
            show: true,
          },
          select: {
            userId: true,
          },
        },
      },
    });

    // 期間全体の参加者を集計する
    const uniqueParticipantIds = new Set<number>();
    let totalParticipantCount = 0;
    for (const event of events) {
      totalParticipantCount += event.stats.length;
      for (const stat of event.stats) {
        uniqueParticipantIds.add(stat.userId);
      }
    }

    // 「ここ1ヶ月」は、指定期間の終了日時から遡った1か月間とする
    const oneMonthAgo = getPreviousMonthDate(period.period.lt);
    const monthlyStartTime =
      oneMonthAgo < period.period.gte ? period.period.gte : oneMonthAgo;
    const monthlyParticipationCounts = new Map<number, number>();
    for (const event of events) {
      if (
        !event.startTime ||
        event.startTime < monthlyStartTime ||
        event.startTime >= period.period.lt
      ) {
        continue;
      }

      for (const stat of event.stats) {
        monthlyParticipationCounts.set(
          stat.userId,
          (monthlyParticipationCounts.get(stat.userId) ?? 0) + 1,
        );
      }
    }

    // 月内4回以上と1〜3回の人数を分け、表示時に合計も示す
    const monthlyParticipationValues = [...monthlyParticipationCounts.values()];
    const frequentParticipantCount = monthlyParticipationValues.filter(
      (count) => count >= 4,
    ).length;
    const occasionalParticipantCount = monthlyParticipationValues.filter(
      (count) => count >= 1 && count < 4,
    ).length;

    // 提示されたSQLに合わせ、ユーザーごとの参加週（ISO週）を重複なく数える
    const participationWeeks = new Map<number, Set<string>>();
    for (const event of events) {
      if (!event.startTime) continue;
      const weekKey = getIsoWeekKey(event.startTime);

      for (const stat of event.stats) {
        const weeks = participationWeeks.get(stat.userId) ?? new Set<string>();
        weeks.add(weekKey);
        participationWeeks.set(stat.userId, weeks);
      }
    }
    const continuingParticipantCount = [...participationWeeks.values()].filter(
      (weeks) => weeks.size >= 5,
    ).length;

    return {
      eventCount: events.length,
      uniqueParticipantCount: uniqueParticipantIds.size,
      totalParticipantCount,
      frequentParticipantCount,
      occasionalParticipantCount,
      monthlyParticipantCount:
        frequentParticipantCount + occasionalParticipantCount,
      continuingParticipantCount,
    };
  }

  /**
   * 今期と前期の統計を定例会用の文章に整形する
   * @param summary 今期の統計
   * @param previousSummary 前期の統計
   * @returns コードブロックで囲んだ統計文章
   */
  private _formatSummary(
    summary: MeetingSummary,
    previousSummary: MeetingSummary,
  ): string {
    const lines = [
      `・イベント数: ${summary.eventCount}件 (前回 ${previousSummary.eventCount}件)`,
      `・ユニーク参加者数: ${summary.uniqueParticipantCount}人 (前回 ${previousSummary.uniqueParticipantCount}人)`,
      `・のべ参加者数(重複あり): ${summary.totalParticipantCount}人 (前回 ${previousSummary.totalParticipantCount}人)`,
      `・ここ1ヶ月で4回以上イベントに参加した人数: ${summary.frequentParticipantCount}人 (前回 ${previousSummary.frequentParticipantCount}人)`,
      `・ここ1ヶ月で1回以上イベントに参加した人数: ${summary.frequentParticipantCount}人+${summary.occasionalParticipantCount}人 = ${summary.monthlyParticipantCount}人 (前回 ${previousSummary.monthlyParticipantCount}人)`,
      `・5週以上継続して参加してくれているユーザー: ${summary.continuingParticipantCount}人 (前回 ${previousSummary.continuingParticipantCount}人)`,
    ];

    return `\`\`\`\n${lines.join('\n')}\n\`\`\``;
  }
}

/**
 * StatusSummaryForMeetingCommandのインスタンス
 */
export const statusSummaryForMeetingCommand =
  new StatusSummaryForMeetingCommand(statusCommand);
