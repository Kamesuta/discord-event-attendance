/**
 * 行単位の文字列配列を、指定した文字数制限を超えない範囲でまとめて分割します。
 * 各行（配列の要素）は途中で改行されず、ギリギリまで結合されます。
 * 主に Discord メッセージの分割など、文字数制限のあるテキスト送信に便利です。
 * @param lines 1行1要素の文字列配列。
 * @param maxLength 各結合文字列の最大文字数。超えない範囲でまとめられます。
 * @param delimiter 各行の末尾に追加する区切り文字。
 * @returns 文字数制限を超えないように結合された文字列配列。
 */
export function splitStrings(
  lines: string[],
  maxLength: number,
  delimiter = '\n',
): string[] {
  return lines.reduce((acc: string[], name: string) => {
    if (
      acc.length > 0 &&
      acc[acc.length - 1].length + name.length < maxLength
    ) {
      acc[acc.length - 1] += `${name}${delimiter}`;
    } else {
      acc.push(`${name}${delimiter}`);
    }
    return acc;
  }, []);
}
