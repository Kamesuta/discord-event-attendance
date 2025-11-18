# コーディング規約

AIエージェントおよび開発者向けのコーディング規約です。

## 必須ルール

### 命名
- **camelCase**: 変数・関数・パラメータ
- **PascalCase**: クラス・型・インターフェース
- **UPPER_CASE**: 定数
- **`_`prefix**: privateメンバー

命名規則エラーが発生した場合や、新しい変数・クラス・関数を作成する際は [naming-conventions.md](docs/coding/naming-conventions.md) を参照。

### インポート・エクスポート
- `export default` 禁止 → `export const` 使用
- `../` 禁止 → `@/` エイリアス使用
- 拡張子禁止 → `.js`/`.ts` 付けない
- dynamic import禁止 → 静的インポートのみ

インポートエラーが発生した場合や、新しいファイルを作成してインポート・エクスポートを行う際は [imports-exports.md](docs/coding/imports-exports.md) を参照。

### コメント
- 既存コメント削除禁止
- エクスポート要素にJSDoc必須

JSDoc関連のエラーが発生した場合や、新しい関数・クラスを作成する際は [comments.md](docs/coding/comments.md) を参照。

### Discordコマンド
- ファイル名: `XxxCommand.ts`, `XxxMenu.ts`, `XxxAction.ts`
- シングルトン変数でnamed export

新しいDiscordコマンド（スラッシュコマンド・コンテキストメニュー・ボタン/モーダル等のアクション）を作成する際は [discord-commands.md](docs/coding/discord-commands.md) を参照。
