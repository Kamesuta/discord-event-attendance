import type { StreamChunk } from '@tanstack/ai';
import { z } from 'zod';

/**
 * AIプロバイダの基底クラス
 */
export abstract class BaseAiProvider<
  TAdapter,
  TModel extends string,
  TSchema extends z.ZodTypeAny,
> {
  protected adapter?: TAdapter;
  protected adapterApiKey?: string;
  protected readonly schema: TSchema;

  /**
   * @param schema Zodスキーマ
   */
  constructor(schema: TSchema) {
    this.schema = schema;
  }

  /**
   * アダプタを取得します
   * @returns アダプタ
   */
  abstract getAdapter(): TAdapter;

  /**
   * モデル名を取得します
   * @returns モデル名
   */
  abstract getModel(): TModel;

  /**
   * Zodスキーマを元にプロバイダオプションを生成します
   * @returns chat()に渡す追加オプション
   */
  abstract buildOptions(): Record<string, unknown>;

  /**
   * ストリームからJSONを抽出してZodで検証します
   * @param stream ストリーム
   * @returns パース済みデータ
   */
  async parseJsonFromStream(
    stream: AsyncIterable<StreamChunk>,
  ): Promise<z.infer<TSchema>> {
    const text = await this.collectText(stream);
    return this.parseJsonFromText(text);
  }

  /**
   * テキストからJSONを抽出してZodで検証します
   * @param text テキスト
   * @returns パース済みデータ
   */
  parseJsonFromText(text: string): z.infer<TSchema> {
    const rawJson = this.extractJson(text);
    if (!rawJson) {
      throw new Error('AIの応答からJSONを抽出できませんでした');
    }
    const parsed = this.schema.safeParse(rawJson);
    if (!parsed.success) {
      throw new Error(
        `AIの応答JSONの解析に失敗しました: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  }

  /**
   * ストリームからテキストを収集します
   * @param stream ストリーム
   * @returns 収集したテキスト
   */
  protected async collectText(
    stream: AsyncIterable<StreamChunk>,
  ): Promise<string> {
    let text = '';
    for await (const chunk of stream) {
      if (chunk.type === 'content') {
        text += chunk.delta;
        continue;
      }
      if (chunk.type === 'error') {
        throw new Error(chunk.error.message);
      }
      if (chunk.type === 'done') {
        break;
      }
    }
    return text;
  }

  /**
   * テキストからJSONを抽出します
   * @param text テキスト
   * @returns 抽出したJSON
   */
  protected extractJson(text: string): unknown {
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
          // ignore
        }
      }
    }
    return undefined;
  }
}
