# EventCreatorSetupタグ機能分離案

## 背景と課題
- `EventCreatorSetupCommand.ts` にタグ生成/編集/サジェスト更新ロジックが直書きされており、担当者設定と混在して可読性が低下。
- アクション (`SetupConfirmButtonAction` など) が `eventCreatorSetupCommand` の内部状態 (`tagEdits` 等) に直接依存しており、責務境界が不明瞭。
- 目的: タグ機能を `EventTagData`（状態＋操作）へ集約し、コマンドはUI制御とメンバー更新に集中させる。

## 方針
1. **責務の切り出し**  
   - `src/domain/tag/EventTagData.ts` を新設し、タグ状態の生成・AIサジェスト更新・表示文言生成・未保存判定・保存後同期を `EventTagData` に集約する。  
   - `EventTagData` は「パネル単位のタグ編集状態」を保持し、外部（コマンド/アクション）は `EventTagData` のメソッド経由でのみタグを参照・更新する。`EventSpec` / `PendingChange` には触れない。
   - `services` 配下に置かない理由: これは I/O を伴う汎用サービスではなく、「編集状態（データ）に対する操作」を内包したドメインモデル（状態遷移の核）であり、`domain/tag` 配下に置く方が責務が明確。

2. **コマンド側の構造**  
   - `EventCreatorSetupCommand` の `EditData` に `tagData: EventTagData` を持たせ、従来の `tagEdits` / `tagSuggestions` / `aiAttemptedEventIds` / `isRefreshingTagSuggestions` / `tagSuggestionError` 等は削除。  
   - `createSetupPanel`・`formatEventSummary`・ボタン活性判定などで `EventTagData` のAPIを呼び出し、タグ表示や状態判定を委譲する。

3. **アクションの利用方法**  
   - `SetupTagEditAction` / `SetupTagEditModalAction` / `SetupConfirmButtonAction` は `eventCreatorSetupCommand.setupPanels[key]?.tagData` を取得し、`EventTagData` の `getState` / `setPendingTags` / `getDirtyEntries` 等を通じてタグを操作する。  
   - `eventCreatorSetupCommand` の内部フィールド（`tagEdits` 等）には触れず、タグ編集状態は `EventTagData` のみが管理する。

## EventTagData APIイメージ
- `initialize(events, { forceRefreshAi, skipAutoRefresh })`: イベント一覧からサジェストを事前取得し、AI更新を必要に応じて開始。  
- `getState(eventSpec)` / `setPendingTags(eventId, tags)`: 編集状態の取得・更新。  
- `getTagDisplay(eventId)` / `getStatusLine()`: Embed・フッター用の表示文字列を生成。  
- `hasUnsavedChanges()` / `getDirtyEntries()`: 未保存のイベントを返す。  
- `markTagsSaved(eventId, savedTags)`: 保存後に `originalTags` と `pendingTags` を同期。

## 実施ステップ
1. **EventTagData追加**: 既存のタグ関連 private メソッド（サジェスト入力生成、サジェスト確保、AI更新、表示生成、未保存判定、保存後同期など）を `EventTagData.ts` に移植し、上記APIへ整理。`tagService` / `logger` は既存のシングルトンを直接参照する。  
2. **コマンド修正**: `EditData` に `tagData: EventTagData` を追加し、`createSetupPanel` / `formatEventSummary` / `onCommand` などで `EventTagData` を利用するよう書き換え。タグ用フィールドとメソッドは削除。  
3. **アクション修正**: 各アクションから `EventTagData` API を呼ぶように変更し、`eventCreatorSetupCommand` の内部フィールド参照をなくす。  
4. **検証**: `/event_creator setup` を手動で実行し、タグ表示・編集・保存・AI再生成が変わらず動くか確認。

## リスクと対策
- **状態参照切れ**: `tagData` を `EditData` に格納し、常に同じ `EventTagData` インスタンスを更新する。  
- **循環参照**: `EventTagData` は `domain` 配下の型と `TagService` 等のみ参照し、コマンド/アクションを import しない構造にする。  
- **UI差異**: 既存の表示文言とボタン挙動を `EventTagData` 内で再現し、既存振る舞いの手動確認を行う。

## 完了条件
- `EventCreatorSetupCommand.ts` にタグ処理ロジックがなく、`EventTagData` 呼び出しのみになっている。  
- アクション3種が `EventTagData` API を利用してタグの参照・更新・保存を行っている。  
- 手動テストでタグ編集フローとAIサジェストが従来通り動作することを確認。
