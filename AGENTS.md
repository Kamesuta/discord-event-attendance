# AGENTS.md

このプロジェクトでAIエージェントを使用する際のガイドラインです。

## コーディング規約

### 命名規則

#### camelCaseの使用
- 変数、関数、パラメータは**camelCase**を使用すること
- クラス、型、インターフェースは**PascalCase**を使用すること
- 定数は**UPPER_CASE**を使用可能
- privateメンバーは先頭にアンダースコアを付けること（例：`_privateProperty`）

```typescript
// 良い例
const userName = 'John';
function getUserData(): void {}
class UserService {}
const MAX_RETRY_COUNT = 3;

// 悪い例
const user_name = 'John'; // snake_caseは使用しない
function GetUserData(): void {} // PascalCaseは関数に使用しない
```

### インポート・エクスポート規約

#### named exportの使用
- `export default`は使用しないこと
- すべてのエクスポートは**named export**を使用すること

```typescript
// 良い例
export const userService = new UserService();
export function processData(): void {}

// 悪い例
export default new UserService();
export default function processData(): void {}
```

#### @/aliasインポートの使用
- 相対パスの親ディレクトリ参照（`../`）は禁止
- `@/`エイリアスを使用すること
- 同一ディレクトリ（`./`）および下位ディレクトリ（`./foo/`など）の相対パスは許可

```typescript
// 良い例
import { userService } from '@/services/UserService';
import { localHelper } from './localHelper';
import { subModule } from './subdir/module';

// 悪い例
import { userService } from '../services/UserService'; // 親ディレクトリ参照は禁止
```

#### 拡張子の扱い
- インポート時に`.js`や`.ts`などの**拡張子は不要**
- TypeScriptが自動的に解決する

```typescript
// 良い例
import { userService } from '@/services/UserService';

// 悪い例
import { userService } from '@/services/UserService.js';
import { userService } from '@/services/UserService.ts';
```

#### dynamic importの禁止
- `import()`を使用した動的インポートは禁止
- すべて静的インポートを使用すること

```typescript
// 良い例
import { userService } from '@/services/UserService';

// 悪い例
const userService = await import('@/services/UserService');
```

### コメント規約

#### 既存のコメント
- 既存のコメントは削除しないこと
- コメントの内容を変更する場合は、元の意図を維持すること
- コードの変更に伴いコメントが不正確になった場合は、コメントを更新すること

#### JSDoc
- エクスポートされた関数/変数/クラスには**必ずJSDocを付けること**
- JSDocには以下の情報を含めること：
  - 関数/変数/クラスの説明
  - パラメーターの型と説明（関数の場合）
  - 戻り値の型と説明（関数の場合）

```typescript
/**
 * ユーザーデータを取得する
 * @param userId - ユーザーID
 * @returns ユーザーデータ
 */
export function getUserData(userId: string): UserData {
  // 実装
}

/**
 * ユーザーサービスのインスタンス
 */
export const userService = new UserService();
```

## Discordコマンドの実装規約

### コマンドの格納場所と命名規則

#### ディレクトリ構造
- コマンドは`src/commands`ディレクトリ以下に格納する
- コマンドの種類に応じて以下のディレクトリに分類する：
  - スラッシュコマンド：`src/commands/<コマンド名>Command`
  - コンテキストメニュー：`src/commands/contextmenu`
  - アクション：`src/commands/action`

#### ファイル名の形式
- スラッシュコマンド：`<親コマンド名><サブコマンド名>Command.ts`
  - 例：`EventOpSelectCommand.ts`（event_op selectコマンド）
- コンテキストメニュー：`<コマンド名>Menu.ts`
  - 例：`SetMemoUserMenu.ts`
- アクション：`<アクション名>Action.ts`
  - 例：`GameEditButtonAction.ts`

### コマンドのエクスポート方法

コマンドはシングルトン変数として以下の形式でエクスポートする：

```typescript
import { CommandGroupInteraction } from '@/commands/base/commandBase';

class EventOpCommand extends CommandGroupInteraction {
  command = new SlashCommandBuilder()
    .setDescription('イベント対応員用コマンド')
    .setName('event_op');
}

/**
 * EventOpCommandのインスタンス
 */
export const eventOpCommand = new EventOpCommand();
```

### コマンドの登録

各コマンドディレクトリには`commands.ts`を作成し、以下の形式でコマンドを登録する：

```typescript
import { InteractionBase } from '@/commands/base/interactionBase';
import { eventOpAnnounceCommand } from './EventOpAnnounceCommand';
import { eventOpCommand } from './EventOpCommand';
import { eventOpSelectCommand } from './EventOpSelectCommand';

/**
 * イベント運営コマンドの配列
 */
export const eventOpCommands: InteractionBase[] = [
  eventOpCommand,
  eventOpAnnounceCommand,
  eventOpSelectCommand,
];
```

親ディレクトリの`commands.ts`で子ディレクトリのコマンドをインポートして登録する：

```typescript
import { InteractionBase } from '@/commands/base/interactionBase';
import { eventOpCommands } from './eventOpCommand/commands';
import { eventAdminCommands } from './eventAdminCommand/commands';

/**
 * すべてのコマンドの配列
 */
export const allCommands: InteractionBase[] = [
  ...eventOpCommands,
  ...eventAdminCommands,
];
```

## プロジェクト構成

### 主要なディレクトリ

- `src/commands/` - Discordコマンドの実装
- `src/services/` - ビジネスロジック
- `src/handlers/` - イベントハンドラー
- `src/bot/` - Botの初期化と設定
- `src/messageUpdaters/` - メッセージ更新処理

### TypeScript設定

- ターゲット：ES2022
- モジュールシステム：ES Modules（`"type": "module"`）
- `@/`エイリアスが`src/`ディレクトリにマップされている
- strictモードが有効

## ESLintルール（参考）

以下のルールが設定されています：

- `@typescript-eslint/naming-convention`: camelCaseの強制
- `import/extensions`: インポート時の拡張子禁止
- `no-restricted-imports`: 親ディレクトリインポートと.js拡張子の禁止
- `no-restricted-syntax`: dynamic importの禁止
- `jsdoc/require-jsdoc`: エクスポートされた要素へのJSDoc必須化

詳細は[eslint.config.js](eslint.config.js)を参照してください。
