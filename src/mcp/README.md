# Discord Event Attendance MCP Server

Discordイベント出席管理システムの情報をMCP（Model Context Protocol）経由で取得できるサーバーです。

## 概要

このMCPサーバーは、既存の`/status`コマンドの機能をMCPツールとして提供し、イベント情報やユーザー統計、ランキングデータを外部から取得できるようにします。

## 起動方法

```bash
npm run mcp
```

## 提供ツール

### 1. イベント情報取得

#### `get-event-status`

特定イベントの出欠状況を取得

**パラメーター:**

- `eventId` (number, optional): イベントID（省略時は最新のイベント）

**返却データ:**

- イベント基本情報（名前、日時、主催者など）
- 参加者リスト（参加時間、メモ、XP、参加回数など）
- ゲーム結果一覧
- 統計サマリー

#### `get-event-list`

イベント一覧を期間・検索条件で取得

**パラメーター:**

- `period` (string, optional): 期間指定（例：`3-5`=3月〜5月、`2023/3`=2023年3月）
- `search` (string, optional): イベント名検索（AND/OR検索対応）
- `sort` (string, optional): ソート順（`join`/`startTime`/`id`）
- `page` (number, optional): ページ番号

**返却データ:**

- ページング対応のイベント一覧
- フィルター条件情報
- 統計情報（総イベント数、参加者数など）

### 2. ユーザー情報取得

#### `get-user-status`

ユーザーの過去のイベント参加状況を取得

**パラメーター:**

- `userId` (string): DiscordユーザーID
- `page` (number, optional): ページ番号

**返却データ:**

- ユーザー基本情報
- 参加統計（参加回数、主催回数、参加率など）
- 参加イベント履歴
- 主催イベント履歴
- ランキング順位情報

### 3. ゲーム情報取得

#### `get-game-status`

ゲーム結果を取得

**パラメーター:**

- `gameId` (number): ゲームID

**返却データ:**

- ゲーム基本情報
- イベント情報
- 参加者の成績（ランク、XP、グループ別）
- 統計サマリー

### 4. ランキング取得

#### `get-participation-ranking`

イベント参加回数ランキングを取得

**パラメーター:**

- `period` (string, optional): 期間指定
- `search` (string, optional): イベント名検索
- `maxCount` (number, optional): 表示件数（デフォルト20、0で全件）
- `page` (number, optional): ページ番号

#### `get-host-ranking`

イベント主催回数ランキングを取得

#### `get-xp-ranking`

ゲームXP合計ランキングを取得

#### `get-host-performance-ranking`

主催者ごとのイベント参加人数ランキング（主催者評価）を取得

**返却データ（ランキング共通）:**

- ページング対応のランキングデータ
- フィルター条件
- 統計情報

## 使用例

### Claude Desktop での設定

`claude_desktop_config.json` に以下を追加：

```json
{
  "mcpServers": {
    "discord-event-attendance": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/discord-event-attendance"
    }
  }
}
```

### ツールの使用例

```
最新のイベント状況を教えて
→ get-event-status を使用

マイクラのイベント一覧を見せて
→ get-event-list with search: "マイクラ"

ユーザー123456789の参加状況は？
→ get-user-status with userId: "123456789"

直近30日の参加ランキングトップ10は？
→ get-participation-ranking with period: recent

主催者の評価ランキングを見せて
→ get-host-performance-ranking
```

## 特徴

- **高度な検索・フィルタリング**: 期間指定、イベント名検索（AND/OR）
- **ページング対応**: 大量データでも快適な閲覧
- **統計情報付き**: 各種集計・分析データを提供
- **リッチなデータ**: ユーザー情報、イベント詳細、ゲーム成績など

## 技術仕様

- **フレームワーク**: @modelcontextprotocol/sdk
- **データベース**: Prisma + MySQL
- **型安全**: TypeScript + Zod
- **既存システム連携**: `/status`コマンドロジックを再利用
