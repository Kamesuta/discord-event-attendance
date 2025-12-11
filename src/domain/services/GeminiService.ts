import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { logger } from '@/utils/log';

/**
 * Geminiから返却される1イベント分のタグ候補
 */
const geminiSuggestionSchema = z
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

const geminiBatchResponseSchema = z
  .array(
    geminiSuggestionSchema
      .extend({
        eventId: z
          .string()
          .describe('入力で受け取ったeventIdと一致するIDを必ず含める'),
      })
      .describe('単一イベントのタグ候補'),
  )
  .describe(`複数イベントのタグ候補をeventId付きの配列で返します。`);

const geminiBatchResponseJsonSchema = z.toJSONSchema(geminiBatchResponseSchema);

/**
 * Geminiへのバッチサジェスト入力
 */
export interface GeminiBatchTagRequest {
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
 * Geminiから返却されたタグ候補
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
   * タグサジェストをバッチで取得します
   * @param params サジェストパラメータ
   * @returns イベントIDをキーにしたタグ候補
   */
  async suggestTagsBatch(
    params: GeminiBatchTagRequest[],
  ): Promise<Record<string, GeminiTagSuggestionResult>> {
    if (!this.isEnabled() || params.length === 0) return {};
    const client = this._getClient();
    if (!client) return {};

    const prompt = this._buildPrompt(params);
    logger.info('[Gemini] Tag batch request prompt', { prompt });
    logger.info('[Gemini] Tag batch schema', {
      schema: geminiBatchResponseJsonSchema,
    });
    try {
      const response = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: geminiBatchResponseJsonSchema,
        },
      });
      logger.info('[Gemini] Tag batch raw response', {
        text: response.text,
      });
      const rawJson = this._extractJson(response.text ?? '');
      if (!rawJson) {
        logger.warn('Geminiの応答からJSONを抽出できませんでした');
        return {};
      }
      const parsed = geminiBatchResponseSchema.safeParse(rawJson);
      if (!parsed.success) {
        logger.warn(
          `Geminiの応答JSONの解析に失敗しました: ${parsed.error.message}`,
        );
        return {};
      }
      const map: Record<string, GeminiTagSuggestionResult> = {};
      for (const entry of parsed.data) {
        const { eventId, ...suggestions } = entry;
        map[eventId] = suggestions;
      }
      return map;
    } catch (error) {
      logger.error('Gemini APIの呼び出しに失敗しました', error);
      return {};
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
  private _buildPrompt(params: GeminiBatchTagRequest[]): string {
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
      const start = sanitized.indexOf('[');
      const end = sanitized.lastIndexOf(']');
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
