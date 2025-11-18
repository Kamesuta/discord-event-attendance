# Discordコマンドの実装規約

## コマンドの格納場所と命名規則

### ディレクトリ構造
コマンドは`src/commands`ディレクトリ以下に格納し、種類に応じて分類する：

```
src/commands/
├── base/                    # ベースクラス
│   ├── interactionBase.ts
│   ├── commandBase.ts
│   ├── actionBase.ts
│   └── contextmenuBase.ts
├── <コマンド名>Command/      # スラッシュコマンド
│   ├── XxxCommand.ts
│   ├── XxxSubCommand.ts
│   └── commands.ts
├── contextmenu/             # コンテキストメニュー
│   ├── XxxMenu.ts
│   └── commands.ts
├── action/                  # アクション（ボタン、モーダル、セレクトメニュー）
│   ├── XxxAction.ts
│   ├── <特定コマンド関連>/
│   │   ├── XxxButtonAction.ts
│   │   ├── XxxModalAction.ts
│   │   └── commands.ts
│   └── commands.ts
└── commands.ts              # すべてのコマンドを集約
```

### ファイル名の形式

#### スラッシュコマンド
`<親コマンド名><サブコマンド名>Command.ts`

例：
- `EventOpCommand.ts` - `/event_op`コマンド（親コマンド）
- `EventOpSelectCommand.ts` - `/event_op select`コマンド
- `EventOpAnnounceCommand.ts` - `/event_op announce`コマンド

#### コンテキストメニュー
`<コマンド名>Menu.ts`

例：
- `SetMemoUserMenu.ts` - ユーザーにメモを設定するメニュー
- `StatusUserMenu.ts` - ユーザーのステータスを表示するメニュー

#### アクション
`<アクション名>Action.ts`

例：
- `GameEditButtonAction.ts` - ゲーム編集ボタンのアクション
- `GameEditModalAction.ts` - ゲーム編集モーダルのアクション
- `SetupEventSelectAction.ts` - イベント選択のセレクトメニューアクション

## コマンドのエクスポート方法

### 基本パターン
コマンドはシングルトン変数として**named export**でエクスポートする：

```typescript
import { CommandGroupInteraction } from '@/commands/base/commandBase';
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

class EventOpCommand extends CommandGroupInteraction {
  command = new SlashCommandBuilder()
    .setDescription('イベント対応員用コマンド')
    .setName('event_op')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);
}

/**
 * EventOpCommandのインスタンス
 */
export const eventOpCommand = new EventOpCommand();
```

### 変数名の規則
- クラス名：`PascalCase` + `Command`/`Menu`/`Action`
- 変数名：`camelCase` + `Command`/`Menu`/`Action`

```typescript
// 親コマンド
class EventOpCommand extends CommandGroupInteraction {}
export const eventOpCommand = new EventOpCommand();

// サブコマンド
class EventOpSelectCommand extends CommandInteraction {}
export const eventOpSelectCommand = new EventOpSelectCommand();

// コンテキストメニュー
class SetMemoUserMenu extends ContextmenuInteraction {}
export const setMemoUserMenu = new SetMemoUserMenu();

// アクション
class GameEditButtonAction extends ActionInteraction {}
export const gameEditButtonAction = new GameEditButtonAction();
```

## コマンドの登録

### commands.ts の作成
各コマンドディレクトリには`commands.ts`を作成し、コマンドを配列で登録する：

```typescript
import { InteractionBase } from '@/commands/base/interactionBase';
import { eventOpAnnounceCommand } from './EventOpAnnounceCommand';
import { eventOpCommand } from './EventOpCommand';
import { eventOpPanelCommand } from './EventOpPanelCommand';
import { eventOpSelectCommand } from './EventOpSelectCommand';
import { eventOpShowCommand } from './EventOpShowCommand';
import { eventOpTodayCommand } from './EventOpTodayCommand';
import { eventOpUpdateCommand } from './EventOpUpdateCommand';
import { eventOpUpdateMessageCommand } from './EventOpUpdateMessageCommand';

/**
 * イベント運営コマンドの配列
 */
export const eventOpCommands: InteractionBase[] = [
  eventOpCommand,
  eventOpAnnounceCommand,
  eventOpPanelCommand,
  eventOpSelectCommand,
  eventOpShowCommand,
  eventOpUpdateCommand,
  eventOpUpdateMessageCommand,
  eventOpTodayCommand,
];
```

### 親ディレクトリでの集約
親ディレクトリの`commands.ts`で子ディレクトリのコマンドをインポートして集約する：

```typescript
import { InteractionBase } from '@/commands/base/interactionBase';
import { eventOpCommands } from './eventOpCommand/commands';
import { eventAdminCommands } from './eventAdminCommand/commands';
import { eventCommands } from './eventCommand/commands';
import { eventCreatorCommands } from './eventCreatorCommand/commands';
import { statusCommands } from './statusCommand/commands';
import { contextmenuCommands } from './contextmenu/commands';
import { actionCommands } from './action/commands';

/**
 * すべてのコマンドの配列
 */
export const allCommands: InteractionBase[] = [
  ...eventOpCommands,
  ...eventAdminCommands,
  ...eventCommands,
  ...eventCreatorCommands,
  ...statusCommands,
  ...contextmenuCommands,
  ...actionCommands,
];
```

## コマンドの実装例

### 親コマンド（グループコマンド）

```typescript
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { CommandGroupInteraction } from '@/commands/base/commandBase';

class EventOpCommand extends CommandGroupInteraction {
  command = new SlashCommandBuilder()
    .setDescription('イベント対応員用コマンド')
    .setName('event_op')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);
}

/**
 * EventOpCommandのインスタンス
 */
export const eventOpCommand = new EventOpCommand();
```

### サブコマンド

```typescript
import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from 'discord.js';
import { CommandInteraction } from '@/commands/base/commandBase';
import { eventOpCommand } from './EventOpCommand';

class EventOpSelectCommand extends CommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setDescription('イベントを選択する')
    .setName('select');

  parent = eventOpCommand;

  /**
   * コマンドを実行する
   * @param interaction - インタラクション
   */
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // 実装
  }
}

/**
 * EventOpSelectCommandのインスタンス
 */
export const eventOpSelectCommand = new EventOpSelectCommand();
```

### コンテキストメニュー

```typescript
import { ApplicationCommandType, ContextMenuCommandBuilder, UserContextMenuCommandInteraction } from 'discord.js';
import { ContextmenuInteraction } from '@/commands/base/contextmenuBase';

class SetMemoUserMenu extends ContextmenuInteraction {
  command = new ContextMenuCommandBuilder()
    .setName('メモを設定')
    .setType(ApplicationCommandType.User);

  /**
   * コンテキストメニューを実行する
   * @param interaction - インタラクション
   */
  async execute(interaction: UserContextMenuCommandInteraction): Promise<void> {
    // 実装
  }
}

/**
 * SetMemoUserMenuのインスタンス
 */
export const setMemoUserMenu = new SetMemoUserMenu();
```

### アクション（ボタン）

```typescript
import { ButtonInteraction } from 'discord.js';
import { ActionInteraction } from '@/commands/base/actionBase';

class GameEditButtonAction extends ActionInteraction {
  customId = /^game_edit_(?<gameId>\d+)$/;

  /**
   * ボタンアクションを実行する
   * @param interaction - インタラクション
   */
  async execute(interaction: ButtonInteraction): Promise<void> {
    const { gameId } = interaction.customId.match(this.customId)?.groups ?? {};
    // 実装
  }
}

/**
 * GameEditButtonActionのインスタンス
 */
export const gameEditButtonAction = new GameEditButtonAction();
```

## 注意事項

### parent の指定
サブコマンドには必ず`parent`プロパティで親コマンドを指定すること：

```typescript
class EventOpSelectCommand extends CommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setDescription('イベントを選択する')
    .setName('select');

  parent = eventOpCommand; // 必須
}
```

### customId の命名
アクションの`customId`は、関連するコマンドや機能が分かる名前を付けること：

```typescript
// 良い例
customId = /^game_edit_(?<gameId>\d+)$/;
customId = /^panel_start_(?<eventId>\d+)$/;
customId = /^review_mark_(?<userId>\d+)$/;

// 悪い例
customId = /^btn1_(?<id>\d+)$/;
customId = /^action_(?<data>.+)$/;
```

## 参考ファイル

実装例は以下のファイルを参照：
- [src/commands/eventOpCommand/EventOpCommand.ts](../../src/commands/eventOpCommand/EventOpCommand.ts)
- [src/commands/eventOpCommand/EventOpSelectCommand.ts](../../src/commands/eventOpCommand/EventOpSelectCommand.ts)
- [src/commands/eventOpCommand/commands.ts](../../src/commands/eventOpCommand/commands.ts)
- [src/commands/commands.ts](../../src/commands/commands.ts)
