import { chat } from '@tanstack/ai';
import { z } from 'zod';
import { GeminiAiProvider } from '@/domain/services/aiProviders/GeminiAiProvider';
import { logger } from '@/utils/log';

/**
 * AIから返却される1イベント分のタグ候補
 */
const aiSuggestionSchema = z
  .object({
    preselectExisting: z
      .array(z.string())
      .describe('必須で1～3件。availableTagsの中からイベントに最適なタグを選ぶ')
      .optional()
      .default([]),
    optionalExisting: z
      .array(z.string())
      .describe('任意で0～4件。availableTagsから関連性がありそうなタグを提案')
      .optional()
      .default([]),
    newSuggestions: z
      .array(z.string())
      .describe('任意で0～2件。availableTagsに存在しない新規タグ案を提案')
      .optional()
      .default([]),
  })
  .describe('各イベントのタグ候補オブジェクト');

const aiBatchResponseSchema = z
  .array(
    aiSuggestionSchema
      .extend({
        eventId: z
          .string()
          .describe('入力で受け取ったeventIdと一致するIDを必ず含める'),
      })
      .describe('単一イベントのタグ候補'),
  )
  .describe(`複数イベントのタグ候補をeventId付きの配列で返します。`);

const tagSuggestionAiProvider = new GeminiAiProvider(aiBatchResponseSchema);

/**
 * AIへのバッチサジェスト入力
 */
export interface AiBatchTagRequest {
  /**
   * イベントID (Discord Scheduled Event ID)
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
   * 現在設定済みのタグ
   */
  currentTags: string[];
  /**
   * 再利用可能なタグ一覧
   */
  availableTags: string[];
}

/**
 * AIから返却されたタグ候補
 */
export type AiTagSuggestionResult = z.infer<typeof aiSuggestionSchema>;

/**
 * TanStack AI経由でAIモデルとのやりとりを提供するサービス
 */
class AiService {
  /**
   * タグサジェストをバッチで取得します
   * @param params サジェストパラメータ
   * @returns イベントIDをキーにしたタグ候補
   */
  async suggestTagsBatch(
    params: AiBatchTagRequest[],
  ): Promise<Record<string, AiTagSuggestionResult>> {
    if (params.length === 0) return {};

    const prompt = this._buildPrompt(params);
    logger.info('[AI] Tag batch request prompt', { prompt });
    try {
      // Gemini Generator では「output」指定に対応していないため、providerOptionsで指定する
      const adapter = tagSuggestionAiProvider.getAdapter();
      const stream = chat({
        adapter,
        model: tagSuggestionAiProvider.getModel(),
        messages: [{ role: 'user', content: prompt }],
        ...tagSuggestionAiProvider.buildOptions(),
      });
      const parsed = await tagSuggestionAiProvider.parseJsonFromStream(stream);
      const map: Record<string, AiTagSuggestionResult> = {};
      for (const entry of parsed) {
        const { eventId, ...suggestions } = entry;
        map[eventId] = suggestions;
      }
      return map;
    } catch (error) {
      logger.error('AIの呼び出しに失敗しました', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('AIの呼び出しに失敗しました');
    }
  }

  /**
   * プロンプトを生成します
   * @param params サジェストパラメータ
   * @returns プロンプト文字列
   */
  private _buildPrompt(params: AiBatchTagRequest[]): string {
    const allAvailableTags = Array.from(
      new Set(params.flatMap((event) => event.availableTags)),
    );
    const available =
      allAvailableTags.length > 0
        ? allAvailableTags.join(', ')
        : '既存タグなし';
    const eventDescriptions = params
      .map((event, index) => {
        const description =
          (event.description ?? '').trim().slice(0, 1200) || '説明なし';
        const current =
          event.currentTags.length > 0
            ? event.currentTags.join(', ')
            : '未設定';
        return [
          `Event #${index + 1}`,
          `eventId: ${event.eventId}`,
          `title: ${event.title}`,
          `description: ${description}`,
          `currentTags: ${current}`,
        ].join('\n');
      })
      .join('\n\n');

    return [
      'あなたはDiscordコミュニティイベントのタグ分類アシスタントです。',
      '指定したイベントタイトルと説明文から、各eventIdに対するタグ候補を選択・提案してください。',
      '',
      `availableTags: ${available}`,
      '',
      eventDescriptions,
      '',
      '日本語のタグを優先し、固有名詞やゲームタイトルがあれば積極的に使ってください。',
    ].join('\n');
  }
}

/**
 * AIサービスのインスタンス
 */
export const aiService = new AiService();
