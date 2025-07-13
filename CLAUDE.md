# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 言語とコミュニケーション

**重要**: この日本語プロジェクトでは、Claude Codeは日本語で返答してください。コメントや説明も日本語で行ってください。

## プロジェクト概要

このプロジェクトは、Discordイベントの出席管理Bot（`discord-event-attendance`）です。Discordのボイスチャンネル・ステージチャンネルイベントの参加者を記録し、統計を提供し、主催者お伺いワークフローを含むイベント管理機能を提供します。

### 主要機能
- ボイスチャンネル監視による出席追跡
- 参加者レビュー・承認システム
- XPシステム付きゲーム結果記録
- DM転送システム付き主催者お伺いワークフロー
- イベント管理・スケジューリング
- 外部統合用MCP（Model Context Protocol）サーバー

## 開発コマンド

### ビルド・開発
- `npm run start` - tsxローダーでBotを起動
- `npm run start:bot` - Botのみ起動
- `npm run start:mcp` - MCPサーバーのみ起動
- `npm run build` - クリーンしてTypeScriptコンパイル
- `npm run tsc` - TypeScriptコンパイルのみ
- `npm run clean` - distフォルダ削除

### コード品質
- `npm run lint` - TypeScriptチェック・ESLint実行（**必須：コード変更後は必ず実行**）
- `npm run prettier` - Prettierでコード整形

### データベース
- `prisma generate` - Prismaクライアント生成
- `prisma migrate deploy` - マイグレーション実行（本番用）

## アーキテクチャ

### エントリーポイント
- `src/bot.ts` - Discord Botエントリーポイント
- `src/mcp/server.ts` - MCPサーバーエントリーポイント
- `src/index.ts` - 統合エントリーポイント

### コアシステム

#### コマンドシステム
- **場所**: `src/commands/`
- **構造**: ベースクラスを使った階層化コマンドグループ
- **ベースクラス**: `command_base.ts`, `action_base.ts`, `contextmenu_base.ts`
- **登録**: 各ディレクトリの`commands.ts`ファイルで自動登録
- **ハンドラー**: `CommandHandler.ts`が全インタラクションを処理

#### イベント管理
- **マネージャー**: `EventManager.ts` - コアイベント操作
- **ワークフロー**: `HostWorkflowManager.ts` - 主催者お伺いワークフロー
- **DM転送**: `DMRelayManager.ts` - メッセージベースDM転送
- **スケジューリング**: `HostRequestScheduler.ts` - 自動スケジューリング

#### データベース層
- **ORM**: Prisma + MySQL
- **クライアント**: `src/utils/prisma.ts`
- **スキーマ**: `prisma/schema.prisma`
- **主要モデル**: Event, User, UserStat, HostRequest, HostWorkflow

#### メッセージシステム
- **更新機能**: `src/message_updaters/` - 自動更新Discordメッセージ
- **マネージャー**: `MessageUpdateManager.ts` - メッセージ更新調整
- **エディター**: `MessageEditor.ts` - メッセージ修正処理

### 設定
- **ファイル**: `run/config.toml`（`config.default.toml`からコピー）
- **型定義**: `src/utils/config.ts`
- **機能**: サーバーID、チャンネルマッピング、ロール設定、絵文字マッピング

## コーディング規約

### TypeScript設定
- **ターゲット**: ES2022 + Nodeモジュール
- **厳密**: 全厳密型チェック有効
- **ソースマップ**: デバッグ用に有効
- **出力**: `dist/`ディレクトリ

### ESLintルール
- **ベース**: TypeScript-ESLint推奨 + JSDoc
- **命名**: camelCase、型にはPascalCase
- **JSDoc**: 全publicな関数・クラスに必須
- **プライベートメンバー**: アンダースコア必須

### コマンド実装

#### コマンド構造
```
src/commands/<command_group>_command/
├── <CommandGroup>Command.ts      # メインコマンドクラス
├── <CommandGroup><Action>Command.ts  # サブコマンド
├── commands.ts                   # 全コマンドエクスポート
└── ...
```

#### アクション構造
```
src/commands/action/<command_group>_command/
├── <Action>ButtonAction.ts      # ボタンインタラクション
├── <Action>ModalAction.ts       # モーダルインタラクション
├── commands.ts                  # 全アクションエクスポート
└── ...
```

#### 命名規則
- **スラッシュコマンド**: `<Group><Action>Command.ts`
- **コンテキストメニュー**: `<Action>Menu.ts`
- **アクション**: `<Action>Action.ts`
- **エクスポート**: シングルトンパターンでdefaultエクスポート

### データベースパターン

#### イベントフロー
1. Discordイベント作成で`EventManager.createEvent()`実行
2. ボイス状態変更を`onVoiceStateUpdate()`で記録
3. 出席追跡用UserStatレコード更新
4. `HostWorkflowManager`で主催者ワークフロー管理

#### 主催者お伺いワークフロー
1. 候補者選択を含む計画フェーズ
2. タイムアウト処理付きDMリクエスト送信
3. メッセージベースDM転送（DB会話保存なし）
4. HostRequest/HostWorkflowモデルでステータス追跡

## 重要な注意事項

### JSDoc要件
エクスポートされた全関数に以下を含むJSDocが必須：
- 関数の説明
- パラメーター型・説明
- 戻り値型・説明
- 既存コメントは削除禁止

### セキュリティ考慮事項
- リポジトリにシークレット情報をコミット禁止
- トークンは環境変数を使用
- 全ユーザー入力のバリデーション
- Discord API呼び出し前の権限チェック

### DM転送システム
データベース保存ではなくDiscordメッセージ機能を使用：
- メタデータ追跡用Embedフッター
- 会話整理用スレッドベース
- 返信チェーン用メッセージID参照