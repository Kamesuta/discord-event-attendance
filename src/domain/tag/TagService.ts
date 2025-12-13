import type { Tag } from '@/generated/prisma/client';
import { geminiService } from '@/domain/services/GeminiService';
import { prisma } from '@/utils/prisma';

type TagWithUsageCount = Tag & {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  _count: {
    events: number;
  };
};

/**
 * タグ候補
 */
export interface TagSuggestion {
  /**
   * タグ名
   */
  name: string;
  /**
   * 既存タグかどうか
   */
  isNew: boolean;
  /**
   * 初期選択状態にするか
   */
  preselect: boolean;
}

/**
 * サジェスト入力
 */
export interface TagSuggestionInput {
  /**
   * DiscordイベントID
   */
  eventId: string;
  /**
   * イベントタイトル
   */
  title: string;
  /**
   * イベント説明
   */
  description?: string | null;
  /**
   * 現在のタグ
   */
  currentTags: string[];
}

/**
 * タグを管理するサービス
 */
class TagService {
  /**
   * タグ名を正規化します
   * @param name タグ名
   * @returns 正規化したタグ名
   */
  normalizeTagName(name: string): string {
    return name.replace(/^#+/, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * タグ名の配列を正規化し、重複を取り除きます
   * @param names タグ名の配列
   * @returns 正規化済みのタグ名配列
   */
  sanitizeTagNames(names: string[]): string[] {
    const seen = new Set<string>();
    const sanitized: string[] = [];
    for (const rawName of names) {
      const name = this.normalizeTagName(rawName);
      if (!name) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      sanitized.push(name);
    }
    return sanitized;
  }

  /**
   * テキスト入力からタグ配列を抽出します
   * 「#タグ1#タグ2」や「#タグ1 #タグ2」のように # 区切りで入力された文字列を解析します
   * @param rawInput 入力文字列
   * @returns 正規化済みタグ配列
   */
  parseTagInput(rawInput: string): string[] {
    const words = rawInput.split(/\s+/).filter(Boolean);
    const tags: string[] = [];
    for (const word of words) {
      if (!word.startsWith('#')) continue;
      const trimmed = word.replace(/^#+/, '');
      const splitByHash = trimmed
        .split('#')
        .map((part) => part.trim())
        .filter(Boolean);
      tags.push(...splitByHash);
    }
    return this.sanitizeTagNames(tags);
  }

  /**
   * タグを作成または取得します
   * @param name タグ名
   * @returns タグ
   */
  async getOrCreateTag(name: string): Promise<Tag> {
    const normalized = this.normalizeTagName(name);
    const existing = await prisma.tag.findUnique({
      where: { name: normalized },
    });
    if (existing) return existing;
    return await prisma.tag.create({
      data: { name: normalized },
    });
  }

  /**
   * イベントのタグを設定します
   * @param eventId イベントID
   * @param tagNames タグ名配列
   * @returns 設定後のタグ配列
   */
  async setEventTags(eventId: number, tagNames: string[]): Promise<Tag[]> {
    const sanitizedNames = this.sanitizeTagNames(tagNames);
    const tags: Tag[] = await Promise.all(
      sanitizedNames.map(async (name) => await this.getOrCreateTag(name)),
    );
    await prisma.event.update({
      where: { id: eventId },
      data: {
        tags: {
          set: tags.map((tag) => ({ id: tag.id })),
        },
      },
    });
    return tags;
  }

  /**
   * イベント一覧のタグ候補を生成します
   * @param inputs イベント入力
   * @param options オプション
   * @returns イベントIDをキーにしたタグ候補
   */
  async buildSuggestionsForEvents(
    inputs: TagSuggestionInput[],
    options?: { useAi?: boolean },
  ): Promise<Record<string, TagSuggestion[]>> {
    if (inputs.length === 0) return {};
    const sanitizedInputs = inputs.map((input) => {
      const sanitizedTags = this.sanitizeTagNames(input.currentTags);
      const keywords = this._extractKeywords(
        `${input.title} ${input.description ?? ''}`,
      );
      return {
        ...input,
        currentTags: sanitizedTags,
        keywords,
      };
    });
    const popularTags = await this._fetchPopularTags();
    const availableTagNames = popularTags.map((tag) => tag.name);
    const useAi = options?.useAi !== false;
    const aiMap = useAi
      ? await this._getAiSuggestionsBatch(sanitizedInputs, availableTagNames)
      : {};
    const suggestions: Record<string, TagSuggestion[]> = {};
    for (const input of sanitizedInputs) {
      const fallback = this._buildFallbackSuggestions(
        input.currentTags,
        popularTags,
        input.keywords,
      );
      const aiSuggestions = aiMap[input.eventId];
      suggestions[input.eventId] = this._mergeSuggestions(
        aiSuggestions,
        fallback,
      );
    }
    return suggestions;
  }

  /**
   * タグの表示用文字列を生成します
   * @param tagNames タグ名配列
   * @returns 表示用文字列
   */
  formatTagLine(tagNames: string[]): string {
    const sanitized = this.sanitizeTagNames(tagNames);
    if (sanitized.length === 0) return '';
    return sanitized.map((tag) => `#${tag}`).join(' ');
  }

  /**
   * キーワードを抽出します
   * @param text テキスト
   * @returns キーワード配列
   */
  private _extractKeywords(text: string): string[] {
    const hashtags = Array.from(text.matchAll(/#([^\s#]+)/g)).map(
      (match) => match[1],
    );
    const tokens = text
      .replace(/【|】|［|］|\[|\]|\(|\)|（|）/g, ' ')
      .split(/[\s、，,。.!?／/]+/)
      .filter((token) => token.length >= 2);
    const joined = [...hashtags, ...tokens].map((token) =>
      this.normalizeTagName(token),
    );
    return Array.from(new Set(joined)).slice(0, 16);
  }

  /**
   * Geminiのサジェスト結果を取得します
   * @param inputs サジェスト入力
   * @param availableTags 利用可能なタグ一覧
   * @returns イベントIDをキーにしたタグ候補
   */
  private async _getAiSuggestionsBatch(
    inputs: Array<{
      eventId: string;
      title: string;
      description?: string | null;
      currentTags: string[];
    }>,
    availableTags: string[],
  ): Promise<Record<string, TagSuggestion[]>> {
    const aiResult = await geminiService.suggestTagsBatch(
      inputs.map((input) => ({
        eventId: input.eventId,
        title: input.title,
        description: input.description,
        currentTags: input.currentTags,
        availableTags,
      })),
    );
    const availableSet = new Set(availableTags);
    const suggestions: Record<string, TagSuggestion[]> = {};
    for (const [eventId, result] of Object.entries(aiResult)) {
      const current = this._dedupeSuggestions([
        ...result.preselectExisting.map((name) => ({
          name,
          isNew: !availableSet.has(this.normalizeTagName(name)),
          preselect: true,
        })),
        ...result.optionalExisting.map((name) => ({
          name,
          isNew: !availableSet.has(this.normalizeTagName(name)),
          preselect: false,
        })),
        ...result.newSuggestions.map((name) => ({
          name,
          isNew: true,
          preselect: false,
        })),
      ]);
      suggestions[eventId] = current;
    }
    return suggestions;
  }

  /**
   * 人気タグを取得します
   * @returns 人気タグ一覧
   */
  private async _fetchPopularTags(): Promise<TagWithUsageCount[]> {
    return await prisma.tag.findMany({
      include: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        _count: {
          select: { events: true },
        },
      },
      orderBy: [
        {
          events: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            _count: 'desc',
          },
        },
        { createdAt: 'desc' },
      ],
      take: 32,
    });
  }

  /**
   * 既存のロジックによるフォールバック候補を生成します
   * @param normalizedCurrent 正規化済み現在タグ
   * @param popularTags 人気タグ
   * @param keywords キーワード
   * @returns タグ候補
   */
  private _buildFallbackSuggestions(
    normalizedCurrent: string[],
    popularTags: TagWithUsageCount[],
    keywords: string[],
  ): TagSuggestion[] {
    // 既存タグから1～3個をデフォルト選択候補に
    const defaultSelected: TagSuggestion[] = normalizedCurrent
      .slice(0, 3)
      .map((name) => ({
        name,
        isNew: false,
        preselect: true,
      }));

    // マッチしそうな既存タグを追加
    const remainingDefault = Math.max(0, 3 - defaultSelected.length);
    const matchedExisting = popularTags
      .filter((tag) => {
        if (normalizedCurrent.includes(tag.name)) return false;
        return keywords.some((keyword) =>
          tag.name.toLowerCase().includes(keyword.toLowerCase()),
        );
      })
      .slice(0, remainingDefault)
      .map<TagSuggestion>((tag) => ({
        name: tag.name,
        isNew: false,
        preselect: true,
      }));

    const optionalExisting = popularTags
      .filter(
        (tag) =>
          !normalizedCurrent.includes(tag.name) &&
          !matchedExisting.some((matched) => matched.name === tag.name),
      )
      .slice(0, 3)
      .map<TagSuggestion>((tag) => ({
        name: tag.name,
        isNew: false,
        preselect: false,
      }));

    let selectedExisting = [...defaultSelected, ...matchedExisting];
    const optionalExistingPool = [...optionalExisting];

    // 既存タグの選択がゼロの場合は人気タグから補完
    if (selectedExisting.length === 0 && optionalExistingPool.length > 0) {
      const fallback = optionalExistingPool.splice(0, 2).map((tag) => ({
        ...tag,
        preselect: true,
      }));
      selectedExisting = [...selectedExisting, ...fallback];
    }

    // 新規タグ候補を抽出 (未選択)
    const newCandidates: TagSuggestion[] = [];
    for (const keyword of keywords) {
      if (
        normalizedCurrent.includes(keyword) ||
        selectedExisting.some((tag) => tag.name === keyword) ||
        optionalExistingPool.some((tag) => tag.name === keyword) ||
        newCandidates.some((tag) => tag.name === keyword) ||
        popularTags.some((tag) => tag.name === keyword)
      ) {
        continue;
      }
      newCandidates.push({
        name: keyword,
        isNew: true,
        preselect: false,
      });
      if (newCandidates.length >= 2) break;
    }

    return [...selectedExisting, ...optionalExistingPool, ...newCandidates];
  }

  /**
   * タグ候補をマージします
   * @param primary 第一候補
   * @param fallback フォールバック候補
   * @returns マージ結果
   */
  private _mergeSuggestions(
    primary: TagSuggestion[] | undefined,
    fallback: TagSuggestion[],
  ): TagSuggestion[] {
    const merged = this._dedupeSuggestions([...(primary ?? []), ...fallback]);
    if (merged.length > 0) {
      return merged;
    }
    return this._dedupeSuggestions(fallback);
  }

  /**
   * タグ候補から重複を除去し正規化します
   * @param suggestions タグ候補
   * @returns 正規化済み候補
   */
  private _dedupeSuggestions(suggestions: TagSuggestion[]): TagSuggestion[] {
    const seen = new Set<string>();
    const normalized: TagSuggestion[] = [];
    for (const suggestion of suggestions) {
      const name = this.normalizeTagName(suggestion.name);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      normalized.push({
        ...suggestion,
        name,
      });
    }
    return normalized;
  }
}

/**
 * タグサービスのインスタンス
 */
export const tagService = new TagService();
