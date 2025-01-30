/**
 * 期間
 */
export interface Period {
  /** 開始日と終了日 */
  period?: {
    /** 開始日 */
    gte: Date;
    /** 終了日 */
    lt: Date;
  };
  /** 期間テキスト */
  text: string;
}

/**
 * 期間指定文字列を解析して、開始日と終了日を返す
 * @param periodText 期間指定文字列
 * @returns 期間
 */
export function parsePeriod(periodText: string | undefined): Period {
  const currentYear = new Date().getFullYear();
  let startTime: { gte: Date; lt: Date } | undefined;

  // 期間指定がある場合
  if (periodText) {
    const [start, end] = periodText.split('-').map((part) => {
      // 「2024/3/5」→{ year: 2024, month: 3, date: 5 }
      // 「2024/3」→{ year: 2024, month: 3, date: undefined } (4桁の場合は年指定)
      // 「8/5」→{ year: currentYear, month: 8, date: 5 }
      // 「3」→{ year: currentYear, month: 3, date: undefined }
      // 「2024」→{ year: 2024, month: undefined, date: undefined }
      const split = part.split('/').map((v) => parseInt(v, 10));

      if (split.length === 3) {
        // 「2024/3/5」→{ year: 2024, month: 3, date: 5 }
        return { year: split[0], month: split[1], date: split[2] };
      } else if (split.length === 2) {
        if (split[0] > 999) {
          // 「2024/3」→{ year: 2024, month: 3, date: undefined }
          return { year: split[0], month: split[1], date: undefined };
        } else {
          // 「8/5」→{ year: currentYear, month: 8, date: 5 }
          return {
            year: currentYear,
            month: split[0],
            date: split[1],
          };
        }
      } else if (split.length === 1) {
        if (split[0] > 999) {
          // 「2024」→{ year: 2024, month: undefined, date: undefined }
          return { year: split[0], month: undefined, date: undefined };
        } else {
          // 「3」→{ year: currentYear, month: 3, date: undefined }
          return {
            year: currentYear,
            month: split[0],
            date: undefined,
          };
        }
      } else {
        // 不正な入力の場合、undefinedを返す
        return undefined;
      }
    });

    if (!start) {
      // 不正な入力の場合、全期間とする
      startTime = undefined;
    } else if (!end) {
      // 単一指定
      if (!start.month) {
        // 年指定
        startTime = {
          gte: new Date(start.year, 0, 1), // 年初め
          lt: new Date(start.year + 1, 0, 1), // 翌年初め
        };
      } else if (!start.date) {
        // 月指定
        startTime = {
          gte: new Date(start.year, start.month - 1, 1), // 月初め
          lt: new Date(start.year, start.month, 1), // 翌月初め
        };
      } else {
        // 日指定
        startTime = {
          gte: new Date(start.year, start.month - 1, start.date), // 日初め
          lt: new Date(start.year, start.month - 1, start.date + 1), // 翌日初め
        };
      }
    } else {
      // 範囲指定
      let gte, lt: Date | undefined;
      if (!start.month) {
        // 年指定
        gte = new Date(start.year, 0, 1); // 年初め
      } else if (!start.date) {
        // 月指定
        gte = new Date(start.year, start.month - 1, 1); // 月初め
      } else {
        // 日指定
        gte = new Date(start.year, start.month - 1, start.date); // 日初め
      }
      if (!end.month) {
        // 年指定
        lt = new Date(end.year + 1, 0, 1); // 翌年初め
      } else if (!end.date) {
        // 月指定
        lt = new Date(end.year, end.month, 1); // 翌月初め
      } else {
        // 日指定
        lt = new Date(end.year, end.month - 1, end.date); // 翌日初め
      }
      startTime = {
        gte,
        lt,
      };
    }
  }

  // 期間テキスト
  const text = startTime
    ? `<t:${Math.floor(startTime.gte.getTime() / 1000)}:D> 〜 <t:${Math.floor(startTime.lt.getTime() / 1000 - 1)}:D>`
    : '全期間';

  return {
    period: startTime,
    text,
  };
}

/**
 * 日付を解析してDateオブジェクトを返す
 * 月曜日 → 今週の月曜日の21時
 * 01/23 19:00 → 今年の1月23日の19時
 * 2023/01/23 → 2023年1月23日の21時
 * @param dateText 解析する日付文字列
 * @returns 解析した日付
 */
export function parseDate(dateText: string): Date {
  const result = new Date();
  result.setHours(21, 0, 0, 0); // デフォルトは21時

  // スペース区切りで処理
  for (const part of dateText.split(' ')) {
    // 月火水金土日が含まれている場合は、dateは今週のその曜日の日付とする
    const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'].findIndex(
      (day) => part.includes(day),
    );
    if (dayOfWeek !== -1) {
      result.setDate(
        result.getDate() + ((dayOfWeek - result.getDay() + 7) % 7),
      );
    }

    // スラッシュを含む場合は日付指定
    const dateSplit = part.split('/');
    if (dateSplit.length === 2) {
      // setMonthしてからsetDateすると下記バグを踏むため、setFullYearを使用して一気に設定する
      // 1/30日に2/7日を登録すると、1/30→[月設定]→2/30→2月は28日まで→3/2→[日設定]→3/7になる
      result.setFullYear(
        result.getFullYear(),
        Number(dateSplit[0]) - 1,
        Number(dateSplit[1]),
      );
    } else if (dateSplit.length === 3) {
      result.setFullYear(
        Number(dateSplit[0]),
        Number(dateSplit[1]) - 1,
        Number(dateSplit[2]),
      );
    }

    // コロンを含む場合は時間指定
    if (part.includes(':')) {
      const timeSplit = part.split(':');
      result.setHours(Number(timeSplit[0]));
      result.setMinutes(Number(timeSplit[1]));
    }
  }

  return result;
}
