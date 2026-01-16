import { convertZodToJsonSchema } from '@tanstack/ai';
import { createGemini, type GeminiAdapter } from '@tanstack/ai-gemini';
import { z } from 'zod';
import { BaseAiProvider } from '@/domain/services/aiProviders/BaseAiProvider';

const GEMINI_MODEL = 'gemini-2.5-flash';

type GeminiModel = (typeof GeminiAdapter.prototype.models)[number];

/**
 * Gemini(TanStack AI)の呼び出しをまとめたプロバイダ
 */
export class GeminiAiProvider<
  TSchema extends z.ZodTypeAny,
> extends BaseAiProvider<GeminiAdapter, GeminiModel, TSchema> {
  /**
   * @param schema Zodスキーマ
   */
  constructor(schema: TSchema) {
    super(schema);
  }

  /**
   * モデル名を取得します
   * @returns モデル名
   */
  override getModel(): (typeof GeminiAdapter.prototype.models)[number] {
    return GEMINI_MODEL;
  }

  /**
   * アダプタを取得します
   * @returns Geminiアダプタ
   */
  override getAdapter(): GeminiAdapter {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Gemini APIキーが設定されていません');
    }
    if (!this.adapter || this.adapterApiKey !== apiKey) {
      this.adapter = createGemini(apiKey);
      this.adapterApiKey = apiKey;
    }
    return this.adapter;
  }

  /**
   * JSON Schemaを有効化したプロバイダオプションを生成します
   * @returns プロバイダオプション
   */
  override buildOptions(): Record<string, unknown> {
    return {
      providerOptions: {
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: convertZodToJsonSchema(this.schema),
        },
      },
    };
  }
}
