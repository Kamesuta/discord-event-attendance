# Discord Bot インタラクションシステム概要

このドキュメントでは、`discord-event-attendance` Botのインタラクションシステムの概要と使い方について説明します。

## アーキテクチャ概要

インタラクションシステムは階層的な設計になっており、以下の基底クラスを中心に構成されています：

```
InteractionBase (基底クラス)
├── CommandBasedInteraction (コマンド系)
│   ├── CommandGroupInteraction (コマンドグループ)
│   ├── SubcommandGroupInteraction (サブコマンドグループ)
│   ├── CommandInteraction (単一コマンド)
│   └── SubcommandInteraction (サブコマンド)
├── ActionInteraction (アクション系)
│   ├── MessageComponentActionInteraction (メッセージコンポーネント)
│   └── ModalActionInteraction (モーダル)
└── ContextMenuInteraction (コンテキストメニュー)
    ├── UserContextMenuInteraction (ユーザー右クリック)
    └── MessageContextMenuInteraction (メッセージ右クリック)
```

## 基底クラス詳細

### InteractionBase

すべてのインタラクションの基底クラス。

```typescript
abstract class InteractionBase {
  // コマンド登録
  registerCommands(commandList: ApplicationCommandDataResolvable[]): void {}
  
  // サブコマンド登録
  registerSubCommands(): void {}
  
  // インタラクション処理
  async onInteractionCreate(interaction: Interaction): Promise<void> {}
}
```

**主な役割:**
- Discordへのコマンド登録
- サブコマンド登録の調整
- インタラクションイベントの処理

## コマンドシステム

### 1. CommandGroupInteraction（コマンドグループ）

複数のサブコマンドを持つコマンドの基底クラス。

```typescript
// 実装例: /event_host コマンド
class EventHostCommand extends CommandGroupInteraction {
  command = new SlashCommandBuilder()
    .setDescription('主催者お伺いワークフロー管理')
    .setName('event_host')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);
}
```

**使用例:**
- `/event_host plan` - 計画作成
- `/event_host status` - ステータス確認

### 2. SubcommandInteraction（サブコマンド）

コマンドグループ内の個別機能を実装するクラス。

```typescript
// 実装例: /event_host plan サブコマンド
class EventHostPlanCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('plan')
    .setDescription('主催者お伺いワークフローの計画を作成します');
  
  constructor() {
    super(eventHostCommand); // 親コマンドグループを指定
  }
  
  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // サブコマンドの処理
  }
}
```

### 3. CommandInteraction（単一コマンド）

サブコマンドを持たない独立したコマンド。

```typescript
class SimpleCommand extends CommandInteraction {
  command = new SlashCommandBuilder()
    .setName('simple')
    .setDescription('シンプルなコマンド');
  
  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // コマンドの処理
  }
}
```

## アクションシステム

### 1. MessageComponentActionInteraction（メッセージコンポーネント）

ボタン、セレクトメニューなどのメッセージコンポーネントを処理するクラス。

```typescript
// 実装例: ボタンアクション
class MyButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  constructor() {
    super('my_button', ComponentType.Button);
  }
  
  override create(eventId: number): ButtonBuilder {
    const customId = this.createCustomId({ evt: eventId.toString() });
    return new ButtonBuilder()
      .setCustomId(customId)
      .setLabel('クリック')
      .setStyle(ButtonStyle.Primary);
  }
  
  async onCommand(
    interaction: ButtonInteraction,
    params: URLSearchParams,
  ): Promise<void> {
    const eventId = params.get('evt');
    // ボタンクリック時の処理
  }
}
```

**対応コンポーネント:**
- `ComponentType.Button` - ボタン
- `ComponentType.StringSelect` - 文字列セレクトメニュー
- `ComponentType.UserSelect` - ユーザーセレクトメニュー
- `ComponentType.RoleSelect` - ロールセレクトメニュー
- `ComponentType.ChannelSelect` - チャンネルセレクトメニュー

### 2. ModalActionInteraction（モーダル）

モーダルダイアログを処理するクラス。

```typescript
// 実装例: モーダルアクション
class MyModalAction extends ModalActionInteraction {
  constructor() {
    super('my_modal');
  }
  
  override create(): ModalBuilder {
    // このメソッドは通常使用しない（ボタンアクション側で作成）
    throw new Error('このメソッドは使用しません');
  }
  
  async onCommand(
    interaction: ModalSubmitInteraction,
    params: URLSearchParams,
  ): Promise<void> {
    const eventId = params.get('evt');
    const inputValue = interaction.fields.getTextInputValue('input_field');
    // モーダル送信時の処理
  }
}
```

## カスタムIDシステム

アクションシステムでは、URLSearchParamsを使用した構造化カスタムIDを使用します。

### 構造
```
_={アクションID}&_t={コンポーネントタイプ}&{カスタムパラメータ}
```

### 例
```typescript
// ボタン作成時
const customId = this.createCustomId({ 
  evt: '123',        // イベントID
  pos: '1'           // ポジション
});
// 生成される: "_=my_action&_t=2&evt=123&pos=1"

// 処理時
async onCommand(interaction, params) {
  const eventId = params.get('evt');    // "123"
  const position = params.get('pos');   // "1"
}
```

## コンテキストメニューシステム

### UserContextMenuInteraction（ユーザー右クリック）

```typescript
class UserInfoMenu extends UserContextMenuInteraction {
  command = new ContextMenuCommandBuilder()
    .setName('ユーザー情報');
  
  async onCommand(interaction: UserContextMenuCommandInteraction): Promise<void> {
    const targetUser = interaction.targetUser;
    // ユーザー右クリック時の処理
  }
}
```

### MessageContextMenuInteraction（メッセージ右クリック）

```typescript
class MessageAnalyzeMenu extends MessageContextMenuInteraction {
  command = new ContextMenuCommandBuilder()
    .setName('メッセージ分析');
  
  async onCommand(interaction: MessageContextMenuCommandInteraction): Promise<void> {
    const targetMessage = interaction.targetMessage;
    // メッセージ右クリック時の処理
  }
}
```

## 登録システム

### ディレクトリ構造
```
src/commands/
├── base/                     # 基底クラス
├── {command_group}_command/  # コマンドグループ
│   ├── {CommandGroup}Command.ts
│   ├── {SubCommand}Command.ts
│   └── commands.ts          # エクスポート
├── action/                  # アクション
│   └── {command_group}_command/
│       ├── {Action}Action.ts
│       └── commands.ts      # エクスポート
├── contextmenu/             # コンテキストメニュー
│   ├── {Menu}Menu.ts
│   └── commands.ts          # エクスポート
└── commands.ts              # 全体統合
```

### 登録の流れ

1. **個別commands.ts**でエクスポート
```typescript
// src/commands/event_host_command/commands.ts
export default [
  eventHostCommand,
  eventHostPlanCommand,
  // ...
];
```

2. **全体commands.ts**で統合
```typescript
// src/commands/commands.ts
import eventHostCommands from './event_host_command/commands.js';
import actionCommands from './action/commands.js';

const commands: InteractionBase[] = [
  ...eventHostCommands,
  ...actionCommands,
  // ...
];
```

3. **自動登録プロセス**
- `registerSubCommands()` - サブコマンド登録
- `registerCommands()` - Discordへのコマンド登録
- `onInteractionCreate()` - インタラクション処理

## 実装パターン

### 1. 設定パネル + アクション

```typescript
// 1. コマンドでパネル表示
class SetupCommand extends SubcommandInteraction {
  async onCommand(interaction) {
    const embed = this.createEmbed();
    const buttons = [
      buttonAction.create(eventId),
      selectAction.create(eventId),
    ];
    await interaction.reply({ embeds: [embed], components: buttons });
  }
}

// 2. ボタンアクション
class ButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  async onCommand(interaction, params) {
    const eventId = params.get('evt');
    // ボタン処理 → パネル更新
    await this.updatePanel(interaction, eventId);
  }
}

// 3. セレクトアクション
class SelectAction extends MessageComponentActionInteraction<ComponentType.StringSelect> {
  async onCommand(interaction, params) {
    const eventId = params.get('evt');
    const selected = interaction.values[0];
    // セレクト処理 → パネル更新
    await this.updatePanel(interaction, eventId);
  }
}
```

### 2. モーダル入力フロー

```typescript
// 1. ボタンでモーダル表示
class EditButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  async onCommand(interaction, params) {
    const modal = new ModalBuilder()
      .setCustomId(this.createModalCustomId(params))
      .setTitle('編集')
      .addComponents(/* テキスト入力 */);
    await interaction.showModal(modal);
  }
  
  private createModalCustomId(params) {
    return new URLSearchParams({
      '_': 'edit_modal',
      '_t': 'm',
      'evt': params.get('evt'),
    }).toString();
  }
}

// 2. モーダル送信処理
class EditModalAction extends ModalActionInteraction {
  async onCommand(interaction, params) {
    const eventId = params.get('evt');
    const input = interaction.fields.getTextInputValue('field');
    // 入力処理 → パネル更新
    await this.updateOriginalPanel(interaction, eventId);
  }
}
```

## ベストプラクティス

### 1. エラーハンドリング
```typescript
async onCommand(interaction, params) {
  try {
    await interaction.deferReply({ ephemeral: true });
    // 処理
    await interaction.editReply({ content: '完了' });
  } catch (error) {
    logger.error('処理でエラー:', error);
    await interaction.editReply({
      content: 'エラーが発生しました。再試行してください。',
    });
  }
}
```

### 2. パラメータ検証
```typescript
async onCommand(interaction, params) {
  const eventId = params.get('evt');
  if (!eventId) {
    await interaction.reply({
      content: 'パラメータが不正です。',
      ephemeral: true,
    });
    return;
  }
  
  const eventIdNum = parseInt(eventId);
  if (isNaN(eventIdNum)) {
    await interaction.reply({
      content: 'イベントIDが無効です。',
      ephemeral: true,
    });
    return;
  }
  
  // 処理続行
}
```

### 3. 権限チェック
```typescript
class AdminCommand extends CommandInteraction {
  command = new SlashCommandBuilder()
    .setName('admin')
    .setDescription('管理者コマンド')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
  
  async onCommand(interaction) {
    // 追加の権限チェックも可能
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageEvents)) {
      await interaction.reply({
        content: '権限が不足しています。',
        ephemeral: true,
      });
      return;
    }
    // 処理続行
  }
}
```

### 4. 型安全性
```typescript
// 型を明示的に指定
class TypedAction extends MessageComponentActionInteraction<ComponentType.UserSelect> {
  override create(): UserSelectMenuBuilder {
    // UserSelectMenuBuilder の返却が強制される
  }
  
  async onCommand(
    interaction: UserSelectMenuInteraction, // 型が自動推論される
    params: URLSearchParams,
  ) {
    const selectedUsers = interaction.values; // string[]
  }
}
```

このシステムにより、Discord Botの複雑なインタラクションを構造化された方法で管理できます。