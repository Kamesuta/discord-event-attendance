# インポート・エクスポート規約

## named exportの使用

### 基本ルール
- `export default`は**使用禁止**
- すべてのエクスポートは**named export**を使用すること

```typescript
// 良い例
export const userService = new UserService();
export function processData(): void {}
export class EventHandler {}

// 悪い例
export default new UserService();
export default function processData(): void {}
export default class EventHandler {}
```

### 理由
- インポート時の名前が統一される
- IDEの自動補完が効きやすい
- リファクタリング時の追跡が容易

## @/aliasインポートの使用

### 基本ルール
- 相対パスの親ディレクトリ参照（`../`）は**禁止**
- `@/`エイリアスを使用すること
- 同一ディレクトリ（`./`）および下位ディレクトリ（`./foo/`など）の相対パスは許可

```typescript
// 良い例
import { userService } from '@/services/UserService';
import { eventHandler } from '@/handlers/eventHandler';
import { localHelper } from './localHelper';
import { subModule } from './utils/subModule';

// 悪い例
import { userService } from '../services/UserService'; // 親ディレクトリ参照は禁止
import { eventHandler } from '../../handlers/eventHandler'; // 親ディレクトリ参照は禁止
```

### 設定
`@/`エイリアスは[tsconfig.json](../../tsconfig.json)で以下のように設定されています：

```json
{
  "compilerOptions": {
    "baseUrl": "./",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

## 拡張子の扱い

### 基本ルール
- インポート時に`.js`や`.ts`などの**拡張子は不要**
- TypeScriptが自動的に解決する

```typescript
// 良い例
import { userService } from '@/services/UserService';
import { eventHandler } from './eventHandler';

// 悪い例
import { userService } from '@/services/UserService.js';
import { userService } from '@/services/UserService.ts';
import { eventHandler } from './eventHandler.js';
```

### ESLintエラー
拡張子を付けると以下のエラーが発生します：

```
Do not use .js extension in imports. TypeScript will resolve the correct file.
```

## dynamic importの禁止

### 基本ルール
- `import()`を使用した動的インポートは**禁止**
- すべて静的インポートを使用すること

```typescript
// 良い例
import { userService } from '@/services/UserService';

// 悪い例
const userService = await import('@/services/UserService');
const module = await import(`@/services/${serviceName}`);
```

### 理由
- ビルド時の最適化が効きやすい
- 依存関係の静的解析が可能
- 予期しない実行時エラーを防ぐ

### ESLintエラー
dynamic importを使用すると以下のエラーが発生します：

```
Dynamic import is not allowed. Use static import instead.
```

## 複数のインポート

同じモジュールから複数のエクスポートをインポートする場合は、1つのimport文にまとめること。

```typescript
// 良い例
import { userService, UserService, type UserData } from '@/services/UserService';

// 悪い例（ESLintエラー）
import { userService } from '@/services/UserService';
import { UserService } from '@/services/UserService';
import type { UserData } from '@/services/UserService';
```

## ESLintルール

これらのルールは以下で強制されています：

- `import/extensions`: 拡張子禁止
- `no-restricted-imports`: 親ディレクトリ参照と.js拡張子の禁止
- `no-restricted-syntax`: dynamic import禁止

詳細は[eslint.config.js](../../eslint.config.js)の69-90行目を参照してください。
