# S1 API契約（凍結） — 認証 / 本人認証 / プロフィール

本書は S1 における **frontend-worker と backend-worker の共有契約**。両者はこの契約に厳密に従う。
逸脱が必要なら開発将軍に申告し、本書を更新してから実装する（口頭変更禁止）。

正典: [`../00_master_plan.md`](../00_master_plan.md) / 画面: [`../design/`](../design/) / データ: [`./data-model.md`](./data-model.md)

---

## 0. 前提・モック方針

- 実LINEチャネル・実DB・実Blobは**未接続**。S1は**モックで完結**させ、後で実接続に差し替える。
- **認証モック**: `MOCK_AUTH=1`（既定）のとき、LIFFトークン検証を省略し開発ログインを許可する。
- **データ層**: ローカルにPostgresが無い。**Repository抽象**を設け、`MOCK_DB=1`（既定）で**インメモリ実装**、本番は**Prisma実装**に切替える。S1の全機能はインメモリでE2Eまで通ること。Prisma実装も同時に書くが、実DB接続時に検証する旨をコメントで明記。
- **Blobモック**: 画像アップロードは dev では `data:` URL かプレースホルダ参照を返す。

## 1. 共有型（TypeScript / 文字列リテラル）

```ts
type Gender = "male" | "female";
type Area = "ebisu" | "ikebukuro" | "ginza";
type Role = "user" | "admin";
type IdentityStatus = "pending" | "approved" | "rejected";
type IdDocType = "drivers_license" | "passport" | "my_number_card" | "health_insurance" | "residence_card";

interface MeResponse {
  user: { id: string; role: Role; status: "active" | "suspended" | "withdrawn"; displayName: string | null };
  profile: ProfileDTO | null;
  identity: { status: IdentityStatus; rejectReason: string | null } | null;
  canApply: boolean;            // 本人認証approved かつ profile完成 のとき true
  canApplyReason: string | null; // false の理由（"identity_required" | "profile_required" 等）
}

interface ProfileDTO {
  displayName: string;
  gender: Gender;
  birthdate: string;   // "YYYY-MM-DD"
  age: number;         // サーバ算出（birthdateは返してもよいが ageを必ず付す）
  areaPref: Area[];
  bio: string | null;
  photoUrl: string | null;
  ratingAvg: number;
  ratingCount: number;
}
```

> **PII方針**: APIレスポンスに `lineUserId` を**含めない**。ログにも出さない。

## 2. エンドポイント

すべて JSON。エラーは `{ error: { code: string; message: string } }` と適切な HTTP status。
認証必須エンドポイントは未認証で **401**、権限不足で **403**、バリデーション失敗で **400**。

### 認証
| Method | Path | 説明 | Req | Res |
|---|---|---|---|---|
| POST | `/api/auth/dev-login` | **MOCK専用**。開発ログイン。`MOCK_AUTH!=1`では404 | `{ lineUserId?: string; role?: Role }` | `{ user }` + セッションCookie |
| POST | `/api/auth/line` | LIFF IDトークン検証→User upsert→セッション | `{ idToken: string }` | `{ user }` + Cookie（MOCK時はidToken内のsubをそのまま信頼） |
| POST | `/api/auth/logout` | セッション破棄 | — | `{ ok: true }` |
| GET | `/api/me` | 現在のユーザー＋プロフィール＋認証状態 | — | `MeResponse`（未ログインは401） |

### プロフィール（自分のみ / IDOR禁止）
| Method | Path | 説明 | Req | Res |
|---|---|---|---|---|
| PUT | `/api/profile` | プロフィール作成/更新（upsert） | `{ displayName, gender, birthdate, areaPref, bio? }` | `{ profile: ProfileDTO }` |
| POST | `/api/profile/photo` | 写真アップロード（multipart `file`） | file | `{ photoUrl: string }` |

- `birthdate` は **18歳以上**をサーバ検証。未満は 400 `code:"under_age"`。
- `gender` は必須（3対3判定の根幹）。`areaPref` は1件以上。
- `displayName` 1–32文字、`bio` 0–500文字。すべて zod 検証＋サニタイズ。

### 本人認証
| Method | Path | 説明 | Req | Res |
|---|---|---|---|---|
| POST | `/api/identity/upload` | 身分証画像アップロード（multipart `file`）→一時参照 | file | `{ blobRef: string }` |
| POST | `/api/identity` | 認証申請（status=pending化、却下後の再申請も） | `{ docType, blobRef }` | `{ status: "pending" }` |
| GET | `/api/identity` | 自分の認証状態 | — | `{ status, rejectReason } | null` |

### 運営admin（role=admin のみ / 403ガード）
| Method | Path | 説明 | Req | Res |
|---|---|---|---|---|
| GET | `/api/admin/identity?status=pending` | 審査キュー一覧 | — | `{ items: Array<{ id, userId, docType, blobRef, submittedAt }> }` |
| POST | `/api/admin/identity/[id]/approve` | 承認→**画像削除（blobRef=null, imageDeletedAt=now）**→通知 | — | `{ status: "approved" }` |
| POST | `/api/admin/identity/[id]/reject` | 却下（理由必須）→通知 | `{ reason: string }` | `{ status: "rejected" }` |

- approve時に**必ず画像を削除**し `imageDeletedAt` を記録（PII最小保持 / master_plan §8,§9）。
- 通知は `MOCK_NOTIFY=1` のとき NotificationLog に記録するのみ（実送信しない）。

## 3. 純関数（`src/lib/domain/` / vitest必須）

副作用なし・DB非依存。S1で**単体テスト必須**（各関数に正常+境界+異常ケース）。
```ts
calcAge(birthdate: Date, now: Date): number
isAdult(birthdate: Date, now: Date): boolean              // >= 18
ageInBand(birthdate: Date, minAge: number|null, maxAge: number|null, now: Date): boolean
canApply(input: { identityStatus: IdentityStatus|null; hasCompleteProfile: boolean }): { ok: boolean; reason: string|null }
```

## 4. セキュリティ要件（security-reviewer がチェック）

- セッションCookie: `httpOnly` + `secure`(prod) + `sameSite=lax`。署名/暗号化必須（平文セッションID禁止）。
- 認可: `/api/admin/*` は role=admin を**サーバ側で**検証。プロフィール/認証は**本人のリソースのみ**操作可（IDOR防止：URLや入力のuserIdを信頼せずセッションのuserで解決）。
- 入力: 全エンドポイントで zod 検証＋型強制。`bio`/`displayName` はXSS対策（保存時サニタイズ or 出力時エスケープ方針を明記）。
- 機密: APIキー/シークレットは `.env`（git管理外）。コード/レスポンス/ログに `lineUserId`・身分証参照を出さない。
- 身分証画像: アクセス制限つき保管、approve後に削除。dev でも「削除しました」を実データで示す。

## 5. ファイル所有（並行作業の衝突回避）

- **backend-worker 所有**: `src/lib/**`（repo/domain/auth/session/types）, `src/app/api/**`, `prisma/**`, `src/**/*.test.ts`, seedスクリプト。
- **frontend-worker 所有**: `src/app/(app)/**` と各画面ページ, `src/components/**`, `src/app/page.tsx`（差し替え可）。`globals.css`/`layout.tsx`/`tailwind.config.ts` は既存を使用（大改変時は申告）。
- 共有型は **backend が `src/lib/types.ts` に定義**。frontend は本契約§1に基づき**自前の型を定義してfetchしてよい**（importはS1後の統合で揃える）。
