# backend lib (S1) — auth / repo / domain

S1 サーバーサイド実装。契約: [`docs/backend/api-contract-s1.md`](../../docs/backend/api-contract-s1.md)。

## モック方針（既定で全てモック）

| env | 既定 | 効果 |
|-----|------|------|
| `MOCK_AUTH` | mock（`!=0`） | LINE IDトークン検証を省略し、`sub` をそのまま信頼。`/api/auth/dev-login` を有効化。`MOCK_AUTH=0` で本番検証＆dev-login 404。 |
| `MOCK_DB` | mock（`!=0`） | Repository を in-memory 実装に。`MOCK_DB=0` で Prisma 実装（実DB接続時に検証）。 |
| `MOCK_NOTIFY` | mock（`!=0`） | 通知は記録のみ（実送信しない）。 |
| `AUTH_JWT_SECRET` | （mock時は開発用フォールバック） | セッション暗号鍵。`MOCK_AUTH=0` では必須。 |

> S1 は env 未設定でもそのまま起動・動作する（全てモック既定）。

## レイヤ

- `lib/types.ts` — 共有型（契約§1）。`lineUserId` は DTO に出さない。
- `lib/domain/` — 純関数（`calcAge`/`isAdult`/`ageInBand`/`canApply`）。vitest 対象。
- `lib/repo/` — Repository 抽象（`types` + `memory`[既定] + `prisma-repo`[実DB時]）。`getRepo()` で切替。
- `lib/auth/` — `session`（AES-256-GCM 認証付き暗号化Cookie）/ `guard`（requireUser/requireAdmin, IDOR防止）/ `line-mock`。
- `lib/serializers.ts` — DTO 変換（PII出口関門：lineUserId を遮断）。
- `lib/validation.ts` — zod スキーマ＋サニタイズ。
- `lib/http.ts` — エラーエンベロープ／共通ハンドラ。
- `lib/blob-mock.ts` / `lib/notify-mock.ts` — Blob/通知のモック。
- `lib/slot-service.ts` — S2 応募ゲートの集約（route ↔ domain/repo）。
- `lib/match-service.ts` — S3 成立確定（Match生成/6名accepted/match_to_admin）+ 会場通知（6名 venue_to_member + Match notified + Slot confirmed）+ 参加者判定（IDOR）。
- `lib/domain/match.ts` — S3 純関数 `isSlotFull` / `buildVenueMessage`（会場文面の6要素）。vitest 対象。

## S3（成立 / 会場確定 / 通知 = モック）

- 成立: S2 `applyAtomic` が枠を filled にした直後、apply route が `finalizeMatchOnApply` を呼ぶ → Match(pending_venue) を冪等生成・6名 applied→accepted・admin へ `match_to_admin`。
- admin: `GET /api/admin/matches`(一覧) / `GET /api/admin/matches/[id]`(6名要約+枠) / `POST .../venue`(venueName・reservationName 必須, venueUrl は http(s) のみ, → venue_set) / `POST .../notify`(venue_set のみ可・未入力 409 → 6名 `venue_to_member`(MOCK=status=sent) + Match=notified + Slot=confirmed)。
- user: `GET /api/matches/mine` / `GET /api/matches/[id]`（**IDOR防止: 参加者のみ。非参加者は存在も漏らさず 404**。会場は **notified 後のみ**。members は displayName/gender のみ＝lineUserId 不可）。
- 通知は `NotificationLog`(repo) に記録。MOCK_NOTIFY=1 は status=sent で記録のみ（実 LINE 送信なし）。payload は運用情報のみ（lineUserId/誕生日/カードを入れない）。

## セキュリティ

- セッション: httpOnly + secure(prod) + sameSite=lax。平文セッションID不使用（AES-256-GCM、改竄は復号失敗で弾く）。
- IDOR: リソース所有者はセッションの `sub` で解決。body/URL の userId は信用しない。
- admin: `requireAdmin()` で role をサーバ検証。
- PII: lineUserId/誕生日/トークンをログ・レスポンスに出さない。身分証は承認/却下で `blobRef=null`＋`imageDeletedAt`。

## 検証コマンド（シェル健全時）

```bash
cd /mnt/c/tools/matching-app
./node_modules/.bin/tsc --noEmit          # 型 rc0
npm run test                              # vitest（純関数 PASS / FAIL=0）
npm run build                             # next build exit0
npm run dev                               # 起動 → curl E2E（後始末: pkill -f "next dev"）
```
