import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { logger } from '@/utils/log';

/**
 * Geminiから返却されるタグ候補
 */
const geminiSuggestionSchema = z.object({
  preselectExisting: z
    .array(z.string())
    .describe(
      '必須で1～3件。availableTagsの中からイベントに最適なタグを選び、初期選択状態にしてください。',
    )
    .optional()
    .default([]),
  optionalExisting: z
    .array(z.string())
    .describe(
      '任意で0～4件。availableTagsから関連性がありそうなタグを提案しますが初期選択は行いません。',
    )
    .optional()
    .default([]),
  newSuggestions: z
    .array(z.string())
    .describe('任意で0～2件。availableTagsに存在しない新規タグ案を提案します。')
    .optional()
    .default([]),
});

const geminiResponseJsonSchema = z.toJSONSchema(geminiSuggestionSchema);

/**
 * タグサジェスト時のパラメータ
 */
export interface GeminiTagSuggestParams {
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
 * Geminiが返却したタグサジェスト
 */
export type GeminiTagSuggestionResult = z.infer<typeof geminiSuggestionSchema>;

const GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Gemini APIとのやりとりを提供するサービス
 */
class GeminiService {
  private _client?: GoogleGenAI;
  private _clientApiKey?: string;
  /**
   * APIキーが設定されているか確認します
   * @returns 有効かどうか
   */
  isEnabled(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  /**
   * タグサジェストを取得します
   * @param params サジェストパラメータ
   * @returns サジェスト結果
   */
  async suggestTags(
    params: GeminiTagSuggestParams,
  ): Promise<GeminiTagSuggestionResult | undefined> {
    const client = this._getClient();
    if (!client) return undefined;

    const prompt = this._buildPrompt(params);
    try {
      const response = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: geminiResponseJsonSchema,
        },
      });

      const rawJson = this._extractJson(response.text ?? '');
      if (!rawJson) {
        logger.warn('Geminiの応答からJSONを抽出できませんでした');
        return undefined;
      }
      const parsed = geminiSuggestionSchema.safeParse(rawJson);
      if (!parsed.success) {
        logger.warn(
          `Geminiの応答JSONの解析に失敗しました: ${parsed.error.message}`,
        );
        return undefined;
      }
      return parsed.data;
    } catch (error) {
      logger.error('Gemini APIの呼び出しに失敗しました', error);
      return undefined;
    }
  }

  /**
   * クライアントを取得します
   * @returns Geminiクライアント
   */
  private _getClient(): GoogleGenAI | undefined {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return undefined;
    if (!this._client || this._clientApiKey !== apiKey) {
      this._client = new GoogleGenAI({ apiKey });
      this._clientApiKey = apiKey;
    }
    return this._client;
  }

  /**
   * プロンプトを生成します
   * @param params サジェストパラメータ
   * @returns プロンプト文字列
   */
  private _buildPrompt(params: GeminiTagSuggestParams): string {
    const description =
      (params.description ?? '').trim().slice(0, 1500) || '説明なし';
    const available =
      params.availableTags.length > 0
        ? params.availableTags.join(', ')
        : '既存タグなし';
    const current =
      params.currentTags.length > 0 ? params.currentTags.join(', ') : '未設定';

    return [
      'あなたはDiscordコミュニティイベントのタグ分類アシスタントです。',
      '指定したイベントタイトルと説明文から、最適なタグを選択・提案してください。',
      '',
      `Event title: ${params.title}`,
      `Event description: ${description}`,
      `Existing tags to reuse (availableTags): ${available}`,
      `Current tags confirmed by organizers: ${current}`,
      '',
      '日本語のタグを優先し、固有名詞やゲームタイトルがあれば積極的に使ってください。',
    ].join('\n');
  }

  /**
   * テキストからJSONを抽出します
   * @param text テキスト
   * @returns 抽出したJSON
   */
  private _extractJson(text: string): unknown {
    const sanitized = text
      .replace(/```json/gi, '```')
      .replace(/```/g, '')
      .trim();
    try {
      return JSON.parse(sanitized);
    } catch {
      const start = sanitized.indexOf('{');
      const end = sanitized.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        const subset = sanitized.slice(start, end + 1);
        try {
          return JSON.parse(subset);
        } catch {
          logger.warn('Gemini応答のJSON解析に失敗しました');
        }
      }
    }
    return undefined;
  }
}

/**
 * Geminiサービスのインスタンス
 */
export const geminiService = new GeminiService();
