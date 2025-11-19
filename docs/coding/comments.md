# コメント規約

## 既存のコメント

### 基本ルール
- 既存のコメントは**削除しないこと**
- コメントの内容を変更する場合は、**元の意図を維持すること**
- コードの変更に伴いコメントが不正確になった場合は、**コメントを更新すること**

```typescript
// 悪い例：既存のコメントを削除
// 修正前
// ユーザーデータをキャッシュから取得する
const user = cache.get(userId);

// 修正後（削除してはいけない）
const user = cache.get(userId);

// 良い例：コメントを更新
// 修正前
// ユーザーデータをキャッシュから取得する
const user = cache.get(userId);

// 修正後（コメントも更新）
// ユーザーデータをキャッシュまたはAPIから取得する
const user = cache.get(userId) ?? await fetchUser(userId);
```

## JSDoc

### 基本ルール
エクスポートされた関数/変数/クラスには**必ずJSDocを付けること**。

JSDocには以下の情報を含めること：
- 関数/変数/クラスの説明
- パラメーターの型と説明（関数の場合）
- 戻り値の型と説明（関数の場合）

### 関数のJSDoc

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
 * イベントに参加者を追加する
 * @param eventId - イベントID
 * @param userId - ユーザーID
 * @param options - 追加オプション
 * @returns 追加に成功したかどうか
 */
export async function addParticipant(
  eventId: string,
  userId: string,
  options?: AddParticipantOptions,
): Promise<boolean> {
  // 実装
}
```

### クラスのJSDoc

```typescript
/**
 * ユーザー管理サービス
 */
export class UserService {
  /**
   * ユーザーデータを取得する
   * @param userId - ユーザーID
   * @returns ユーザーデータ
   */
  getUser(userId: string): UserData {
    // 実装
  }
}
```

### 変数のJSDoc

```typescript
/**
 * ユーザーサービスのインスタンス
 */
export const userService = new UserService();

/**
 * 最大リトライ回数
 */
export const MAX_RETRY_COUNT = 3;
```

### 型・インターフェースのJSDoc

```typescript
/**
 * ユーザーデータ
 */
export interface UserData {
  /**
   * ユーザーID
   */
  id: string;

  /**
   * ユーザー名
   */
  name: string;

  /**
   * メールアドレス（オプション）
   */
  email?: string;
}

/**
 * イベントのステータス
 */
export type EventStatus = 'active' | 'inactive' | 'completed';
```

## JSDocが不要な場合

以下の場合はJSDocは不要です：

- エクスポートされていない内部関数・変数
- privateメンバー

```typescript
// JSDoc不要（エクスポートされていない）
function internalHelper(): void {
  // 実装
}

class UserService {
  // JSDoc不要（privateメンバー）
  private _cache: Map<string, User>;

  private _fetchData(): void {
    // 実装
  }

  /**
   * ユーザーデータを取得する（publicメンバーには必要）
   * @param userId - ユーザーID
   * @returns ユーザーデータ
   */
  getUser(userId: string): UserData {
    // 実装
  }
}
```

## 分割代入のパラメータ

分割代入を使用するパラメータの場合、個別の説明は不要です。

```typescript
/**
 * ユーザーを作成する
 * @param params - ユーザー作成パラメータ
 * @returns 作成されたユーザー
 */
export function createUser(params: {
  name: string;
  email: string;
  age?: number;
}): User {
  // 実装
}
```

## ESLintルール

これらのルールは`jsdoc/require-jsdoc`で強制されています。

詳細は[eslint.config.js](../../eslint.config.js)の152-179行目を参照してください。
