import { Prisma } from '@/generated/prisma/client';

/**
 * 検索条件を解析  (空白でAND検索、「 OR 」でOR検索)
 * @param searchText 検索文字列
 * @returns 検索条件
 */
export function parseSearch(
  searchText: string | undefined,
): Prisma.EventWhereInput {
  // 「 OR 」で分割
  const orTerms = searchText ? searchText.split(' OR ') : [];
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    OR:
      orTerms.length > 0
        ? orTerms.map((orTerm) => {
            const andTerms = orTerm.split(' ');
            return {
              // eslint-disable-next-line @typescript-eslint/naming-convention
              AND: andTerms.map((andTerm) => {
                return {
                  name: {
                    contains: andTerm,
                  },
                };
              }),
            };
          })
        : undefined,
  };
}
