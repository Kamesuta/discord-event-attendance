import {
  tagService,
  type TagSuggestion,
  type TagSuggestionInput,
} from '@/domain/tag/TagService';
import { logger } from '@/utils/log';

/**
 * タグ編集状態
 */
export interface TagEditState {
  /**
   * DBに保存されているタグ
   */
  originalTags: string[];
  /**
   * 編集中のタグ
   */
  pendingTags: string[];
  /**
   * サジェスト済みのタグ候補
   */
  suggestions: TagSuggestion[];
}

/**
 * EventTagData初期化オプション
 */
export interface EventTagDataInitializeOptions {
  /**
   * AIタグサジェストを再生成するか
   */
  forceRefreshAi?: boolean;
  /**
   * 自動更新を抑制するか
   */
  skipAutoRefresh?: boolean;
}

/**
 * EventTagData の生成オプション
 */
export interface EventTagDataOptions {
  /**
   * AIサジェスト更新後に呼ばれるフック
   */
  onAfterAiRefresh?: () => Promise<void>;
}

/**
 * EventCreatorSetup のタグ編集状態（データ＋操作）を管理します。
 *
 * `EventCreatorSetupCommand` や各アクションは、タグ関連の参照・更新をこのクラス経由で行います。
 */
export class EventTagData {
  private _tagEdits: Record<string, TagEditState> = {};
  private _tagSuggestions: Record<string, TagSuggestion[]> = {};
  private _aiAttemptedEventIds: Set<string> = new Set<string>();
  private _isRefreshingTagSuggestions = false;
  private _tagSuggestionError: string | undefined;
  private _onAfterAiRefresh: (() => Promise<void>) | undefined;

  /**
   * EventTagDataを作成します
   * @param options 生成オプション
   */
  constructor(options?: EventTagDataOptions) {
    this._onAfterAiRefresh = options?.onAfterAiRefresh;
  }

  /**
   * AIサジェスト更新後に呼ばれるフックを設定します
   * @param onAfterAiRefresh フック
   */
  setAfterAiRefreshHook(onAfterAiRefresh?: () => Promise<void>): void {
    this._onAfterAiRefresh = onAfterAiRefresh;
  }

  /**
   * タグ編集状態を初期化します
   * @param suggestionInputs サジェスト入力
   * @param options 初期化オプション
   */
  async initialize(
    suggestionInputs: TagSuggestionInput[],
    options?: EventTagDataInitializeOptions,
  ): Promise<void> {
    const forceRefreshAi = options?.forceRefreshAi ?? false;
    const skipAutoRefresh = options?.skipAutoRefresh ?? false;

    await this._ensureTagSuggestions(suggestionInputs);

    const shouldAutoRefresh =
      !skipAutoRefresh && this._needsAiTagSuggestions(suggestionInputs);
    const shouldStartRefresh =
      (forceRefreshAi || shouldAutoRefresh) &&
      !this._isRefreshingTagSuggestions;
    if (shouldStartRefresh) {
      this._triggerTagSuggestionRefresh(suggestionInputs);
    }

    for (const input of suggestionInputs) {
      await this._ensureTagEditState(input);
    }
  }

  /**
   * タグ編集状態を取得します（存在しない場合はundefined）
   * @param eventId DiscordイベントID
   * @returns タグ編集状態
   */
  getState(eventId: string): TagEditState | undefined {
    return this._tagEdits[eventId];
  }

  /**
   * タグ編集状態を作成して取得します
   * @param suggestionInput サジェスト入力
   * @returns タグ編集状態
   */
  async getOrCreateState(
    suggestionInput: TagSuggestionInput,
  ): Promise<TagEditState> {
    await this._ensureTagEditState(suggestionInput);
    return this._tagEdits[suggestionInput.eventId];
  }

  /**
   * 編集中タグを更新します
   * @param eventId DiscordイベントID
   * @param tags タグ配列
   */
  setPendingTags(eventId: string, tags: string[]): void {
    const state = this._tagEdits[eventId];
    if (!state) return;
    state.pendingTags = tagService.sanitizeTagNames(tags);
    this._tagEdits[eventId] = state;
  }

  /**
   * タグ表示用の文字列を生成します
   * @param eventId DiscordイベントID
   * @returns 表示用文字列
   */
  getTagDisplay(eventId: string): string {
    return EventTagData.formatTagDisplay(this._tagEdits[eventId]);
  }

  /**
   * タグが未確定か確認します
   * @param eventId DiscordイベントID
   * @returns 未確定かどうか
   */
  hasUnsavedTags(eventId: string): boolean {
    return EventTagData.hasUnsavedTagsState(this._tagEdits[eventId]);
  }

  /**
   * 未保存のタグ変更があるか確認します
   * @returns 未保存のタグ変更があるかどうか
   */
  hasUnsavedChanges(): boolean {
    return Object.keys(this._tagEdits).some((eventId) =>
      this.hasUnsavedTags(eventId),
    );
  }

  /**
   * 未保存のイベントIDと編集状態を返します
   * @returns 未保存エントリ一覧
   */
  getDirtyEntries(): Array<[string, TagEditState]> {
    return Object.entries(this._tagEdits).filter(([eventId]) =>
      this.hasUnsavedTags(eventId),
    );
  }

  /**
   * タグサジェストの状態行を取得します
   * @returns 状態行
   */
  getStatusLine(): string | undefined {
    if (this._isRefreshingTagSuggestions) {
      return 'タグ生成中⏳ AIタグサジェストを更新しています...';
    }
    if (this._tagSuggestionError) {
      return `タグ生成失敗⚠️ ${this._tagSuggestionError}`;
    }
    return undefined;
  }

  /**
   * 保存後にタグ状態を同期します
   * @param eventId DiscordイベントID
   * @param savedTags 保存したタグ
   */
  markTagsSaved(eventId: string, savedTags: string[]): void {
    const state = this._tagEdits[eventId];
    if (!state) return;
    const sanitized = tagService.sanitizeTagNames(savedTags);
    state.originalTags = sanitized;
    state.pendingTags = sanitized;
    this._tagEdits[eventId] = state;
  }

  /**
   * 保留中のタグ変更を取り消します
   */
  discardPendingChanges(): void {
    for (const state of Object.values(this._tagEdits)) {
      state.pendingTags = [...state.originalTags];
    }
  }

  /**
   * タグ表示用の文字列を生成します
   * @param tagState タグ編集状態
   * @returns 表示用文字列
   */
  static formatTagDisplay(tagState?: TagEditState): string {
    const tags = tagService.sanitizeTagNames(tagState?.pendingTags ?? []);
    if (tags.length === 0) return 'タグ: なし';
    const suffix = EventTagData.hasUnsavedTagsState(tagState)
      ? ' (未確定)'
      : '';
    return `タグ: ${tags.map((tag) => `#${tag}`).join(' ')}` + suffix;
  }

  /**
   * タグが未確定か確認します
   * @param tagState タグ編集状態
   * @returns 未確定かどうか
   */
  static hasUnsavedTagsState(tagState?: TagEditState): boolean {
    if (!tagState) return false;
    const normalize = (tags: string[]): string =>
      tagService.sanitizeTagNames(tags).sort().join(' ');
    const original = normalize(tagState.originalTags);
    const pending = normalize(tagState.pendingTags);
    return original !== pending;
  }

  /**
   * タグ編集状態を生成します
   * @param currentTags 現在のタグ
   * @param existingState 既存の編集状態
   * @param suggestions サジェスト済みのタグ候補
   * @returns タグ編集状態
   */
  static buildTagEditState(
    currentTags: string[],
    existingState: TagEditState | undefined,
    suggestions: TagSuggestion[],
  ): TagEditState {
    if (existingState) return existingState;
    const sanitizedCurrentTags = tagService.sanitizeTagNames(currentTags);
    const defaultPending =
      sanitizedCurrentTags.length > 0
        ? sanitizedCurrentTags
        : suggestions
            .filter((suggestion) => suggestion.preselect)
            .map((suggestion) => suggestion.name);
    return {
      originalTags: sanitizedCurrentTags,
      pendingTags: defaultPending,
      suggestions,
    };
  }

  private async _ensureTagSuggestions(
    suggestionInputs: TagSuggestionInput[],
  ): Promise<void> {
    if (suggestionInputs.length === 0) return;
    if (!Object.keys(this._tagSuggestions).length) {
      this._tagSuggestions = await tagService.buildSuggestionsForEvents(
        suggestionInputs,
        { useAi: false },
      );
      return;
    }
    const missingInputs = suggestionInputs.filter(
      (input) => !this._tagSuggestions[input.eventId],
    );
    if (missingInputs.length === 0) return;
    const additionalSuggestions = await tagService.buildSuggestionsForEvents(
      missingInputs,
      { useAi: false },
    );
    this._tagSuggestions = {
      ...this._tagSuggestions,
      ...additionalSuggestions,
    };
  }

  private _needsAiTagSuggestions(
    suggestionInputs: TagSuggestionInput[],
  ): boolean {
    if (suggestionInputs.length === 0) return false;
    if (this._aiAttemptedEventIds.size === 0) return true;
    return suggestionInputs.some(
      ({ eventId }) => !this._aiAttemptedEventIds.has(eventId),
    );
  }

  private _triggerTagSuggestionRefresh(
    suggestionInputs: TagSuggestionInput[],
  ): void {
    if (suggestionInputs.length === 0) return;
    if (this._isRefreshingTagSuggestions) return;
    this._isRefreshingTagSuggestions = true;
    this._tagSuggestionError = undefined;
    void this._refreshTagSuggestions(suggestionInputs);
  }

  private async _refreshTagSuggestions(
    suggestionInputs: TagSuggestionInput[],
  ): Promise<void> {
    const targetEventIds = suggestionInputs.map((input) => input.eventId);
    try {
      const aiSuggestions =
        await tagService.buildSuggestionsForEvents(suggestionInputs);
      if (Object.keys(aiSuggestions).length > 0) {
        this._tagSuggestions = {
          ...this._tagSuggestions,
          ...aiSuggestions,
        };
        for (const eventId of targetEventIds) {
          const nextSuggestions = aiSuggestions[eventId];
          if (!nextSuggestions) continue;
          const tagState = this._tagEdits[eventId];
          if (tagState) {
            tagState.suggestions = nextSuggestions;
            this._tagEdits[eventId] = tagState;
          }
        }
      }
      this._tagSuggestionError = undefined;
    } catch (error) {
      logger.error('AIタグサジェストの更新に失敗しました', error);
      this._tagSuggestionError =
        'タグ生成に失敗しました。 `/event_creator setup refresh_tag_suggestions:true` を打ってもう一度お試しください。';
    } finally {
      for (const eventId of targetEventIds) {
        this._aiAttemptedEventIds.add(eventId);
      }
      this._isRefreshingTagSuggestions = false;
      if (this._onAfterAiRefresh) {
        try {
          await this._onAfterAiRefresh();
        } catch (error) {
          logger.warn(
            'AIタグサジェスト更新後のフック実行に失敗しました',
            error,
          );
        }
      }
    }
  }

  /**
   * タグ編集状態を生成します
   * @param suggestionInput サジェスト入力
   */
  private async _ensureTagEditState(
    suggestionInput: TagSuggestionInput,
  ): Promise<void> {
    const eventId = suggestionInput.eventId;
    const existingState = this._tagEdits[eventId];
    if (existingState) return;

    let suggestions = this._tagSuggestions[eventId];
    if (!suggestions) {
      const fallbackMap = await tagService.buildSuggestionsForEvents(
        [suggestionInput],
        { useAi: false },
      );
      suggestions = fallbackMap[eventId] ?? [];
      this._tagSuggestions[eventId] = suggestions;
    }

    const currentTags = tagService.sanitizeTagNames(
      suggestionInput.currentTags,
    );
    const defaultPending =
      currentTags.length > 0
        ? currentTags
        : suggestions
            .filter((suggestion) => suggestion.preselect)
            .map((suggestion) => suggestion.name);
    this._tagEdits[eventId] = {
      originalTags: currentTags,
      pendingTags: defaultPending,
      suggestions,
    };
  }
}
