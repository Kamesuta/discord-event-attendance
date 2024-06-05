/**
 * イベントを開始します
 * @param lines メッセージを分割する行
 * @param maxLength 1メッセージの最大文字数
 * @param delimiter メッセージの区切り文字
 * @returns 分割されたメッセージ
 */
export default function splitStrings(
  lines: string[],
  maxLength: number,
  delimiter = '\n',
): string[] {
  return lines.reduce(
    (acc, name) => {
      if (acc[acc.length - 1].length + name.length < maxLength) {
        acc[acc.length - 1] += `${name}${delimiter}`;
      } else {
        acc.push(`${name}${delimiter}`);
      }
      return acc;
    },
    [''],
  );
}
