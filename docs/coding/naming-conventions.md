# 命名規則

## 基本ルール

### camelCase（キャメルケース）
変数、関数、パラメータには**camelCase**を使用すること。

```typescript
// 良い例
const userName = 'John';
const isActive = true;
function getUserData(): UserData {}
function processEventData(eventId: string): void {}

// 悪い例
const user_name = 'John'; // snake_caseは使用しない
const UserName = 'John'; // PascalCaseは変数に使用しない
function GetUserData(): UserData {} // PascalCaseは関数に使用しない
```

### PascalCase（パスカルケース）
クラス、型、インターフェース、列挙型には**PascalCase**を使用すること。

```typescript
// 良い例
class UserService {}
interface UserData {}
type EventStatus = 'active' | 'inactive';
enum GameType {
  Solo = 'solo',
  Team = 'team',
}

// 悪い例
class userService {} // camelCaseは使用しない
interface userData {} // camelCaseは使用しない
```

### UPPER_CASE（アッパーケース）
定数には**UPPER_CASE**を使用可能。

```typescript
// 良い例
const MAX_RETRY_COUNT = 3;
const DEFAULT_TIMEOUT = 5000;
const API_BASE_URL = 'https://api.example.com';
```

### privateメンバー
privateメンバーには先頭にアンダースコアを付けること。

```typescript
class UserService {
  // 良い例
  private _cache: Map<string, User>;
  private _apiKey: string;

  private _fetchData(): void {}

  // 悪い例
  private cache: Map<string, User>; // アンダースコアが必要
  private fetchData(): void {} // アンダースコアが必要
}
```

### パラメータの先頭アンダースコア
使用しないパラメータには先頭にアンダースコアを付けることで警告を回避できる。

```typescript
// 良い例
function handler(_req: Request, res: Response): void {
  res.send('OK');
}

// コールバックで使用しない引数
array.map((_item, index) => index);
```

## ESLintルール

これらのルールは`@typescript-eslint/naming-convention`で強制されています。

詳細は[eslint.config.js](../../eslint.config.js)の91-135行目を参照してください。
