# 認証 / 本人認証フロー設計 — LINEログイン + 身分証審査 (S0)

> 正典: [`docs/00_master_plan.md`](../00_master_plan.md) ／ スキーマ: [`schema.prisma`](./schema.prisma)
> 本書はS0設計。実装はS1(認証+本人認証+プロフィール)。LINE/Stripe実クレデンシャルは不要(プレースホルダ+モックで先行)。
> 最終更新: 2026-05-30（本人認証=必須・身分証審査・PII最小保持・IDOR対策を反映）

## 0. 方針

- **パスワードを持たない**。LINEログインに一本化し資格情報の保管リスクを排除。
- アプリは **LIFF** としてLINE内で動作。サーバーは **Next.js Route Handlers / Server Actions**(Vercel)。
- **本人認証=必須ゲート**: LINEログイン後、公的身分証アップロード→運営目視審査→承認。**承認(approved)まで枠応募不可**。これが年齢確認(18+)を兼ねる。
- セッションは **httpOnly Cookie の短命JWT**。PIIをトークンに入れない。

## 1. 全体フロー（ログイン → 本人認証 → 利用可能）

```
[LINEアプリ内]
  ① liff.init(LIFF_ID) → ② liff.isLoggedIn() 否なら liff.login()
  ③ liff.getIDToken() で ID Token(JWT)取得
  ④ POST /api/auth/line { idToken }
[server]
  ⑤ ID Token を LINE で検証(署名/aud/iss/exp/nonce)  ← 信頼境界
  ⑥ payload.sub = lineUserId を取り出す
  ⑦ User upsert(lineUserId キー)
  ⑧ アプリ用セッションJWTを httpOnly Cookie にセット
  ⑨ { user, hasProfile, identityStatus, hasPremiumBadge } を返す
[client] 状態で分岐:
  - identityStatus != approved → 本人認証フローへ(下記 §2)
  - hasProfile == false        → プロフィール登録へ
  - 両方OK                     → 枠一覧へ(応募可能)
```

### ID Token 検証の要点（⑤）
- **必ずサーバー側で検証**。クライアント申告の userId(getProfile等)を信用しない。
  - 検証: `https://api.line.me/oauth2/v2.1/verify`。
  - チェック: 署名 / `iss=https://access.line.me` / `aud == LINE_CHANNEL_ID` / `exp` / 可能なら `nonce`。
- **なぜ重要か**: userId を鵜呑みにすると任意 lineUserId でのなりすましを許す。サーバー検証が唯一の信頼境界。

## 2. 本人認証フロー（必須・初回のみ / 身分証 → 目視審査 → 承認）

```
[client] 身分証種別を選択 + 画像を撮影/選択
  ① POST /api/identity/upload-url   → アクセス制限付き Blob の署名アップロードURLを発行
  ② クライアントが Blob へ直接アップロード(サーバーを経由しない=サーバーに画像を溜めない)
  ③ POST /api/identity { docType, blobRef }
[server]
  ④ IdentityVerification を upsert(status=pending, blobRef, docType, submittedAt)
  ⑤ (任意) admin へ審査依頼の内部通知
[admin 管理画面]
  ⑥ 審査待ち一覧(status=pending) → 画像を目視(本人+admin のみ閲覧可)
  ⑦ 18歳以上・本人性を確認 → 承認 or 却下
       承認: status=approved, reviewedBy/reviewedAt, dobChecked
             → **Blob の画像実体を削除** + blobRef=null + imageDeletedAt 記録 (PII最小保持)
             → ユーザーへ identity_approved 通知
       却下: status=rejected, reviewNote(個人情報を含めない) → identity_rejected 通知(再提出依頼)
             → 画像は運用ポリシーに従い早期削除
[client] approved 後にプロフィール登録 → 枠応募が解禁
```

### 本人認証の設計判断
- **画像はサーバーを経由させない**(署名URLで Blob 直アップロード)。サーバーに身分証を溜めない。
- **承認後は必ず画像削除**。DBには「承認した事実 + メタ(誰がいつ)」だけを残す。
- **番号類のマスク要請**(マイナンバーカード等)。番号・住所などの生データはDBに保存しない。
- 将来 eKYC(TRUSTDOCK等)へ差し替え可能なよう、IdentityVerification は「状態+参照」の薄い構造にしてある。

## 3. User upsert / admin 昇格

- キー: `lineUserId`(ID Token の sub)。初回 User 作成(role=user, status=active)。`displayName` は任意取り込み(表示用途)。
- Profile / IdentityVerification はこの時点では未作成。別ステップで登録/提出。
- **admin 昇格はアプリ経由で行わない**。運営は DB直/シードで `role=admin` を付与(権限昇格の攻撃面を作らない)。

## 4. セッション / トークン方針

| 項目 | 方針 | 理由 |
|------|------|------|
| 形式 | アプリ発行JWT(短命 例1h)を httpOnly + Secure + SameSite=Lax Cookie | XSSでの窃取抑止。CSRFは SameSite + 状態変更APIのCSRF対策で軽減。 |
| 中身 | `sub=userId`(アプリ内ID), `role`, `iat`, `exp`。**lineUserId/PIIは入れない** | 漏洩時の被害最小化。 |
| 署名鍵 | `AUTH_JWT_SECRET`(.env / git管理外) | ハードコード禁止。 |
| 更新 | 失効前に LIFF の ID Token 再取得→再検証→再発行(サイレント) | LIFF常駐で自然に更新。 |
| 失効 | ログアウト/退会で Cookie 破棄。短命JWTでブラックリスト不要(規模小)。 | 〜1千人。 |

> 代替: next-auth + LINE Provider。S1で実装難度/Vercel相性を見て確定。本書は「サーバー検証必須・httpOnly短命JWT・PIIをトークンに入れない」を確定とする。

## 5. 認可・IDOR対策（セキュリティ最優先 / master_plan §9）

- **ゲーティング**: 枠応募API は `identityStatus==approved` を必須化(未認証は403)。限定イベントは年齢/バッジ条件も判定([`matching-logic.md`](./matching-logic.md) §6)。
- **一般API**(プロフィール/枠一覧/応募/マイ応募/評価): 有効セッション必須。
- **運営API**(枠作成/本人認証審査/会場確定/通知/バッジ付与): `role=admin` 二重チェック。
- **リソースオーナー検証(IDOR防止)**: 全取得/更新で「自分のリソースか」を確認。
  - Profile編集・Application取消・Payment参照・Rating投稿: `resource.userId == session.userId`。
  - Match(成立詳細/会場): その Slot に accepted 参加の本人 or admin のみ。
  - 身分証画像(blobRef): 本人 + 審査中 admin のみ。承認後は削除済み。
- **連番ID不使用**: cuid 採用で列挙攻撃を難化。ただし**cuidに頼らず必ず所有者検証**する。

## 6. PII・機微情報の取り扱い（マッチングアプリの肝）

| データ | 機微度 | 取り扱い |
|--------|--------|----------|
| 身分証画像 | 最高 | 署名URLで Blob 直アップロード(サーバー非経由)。**承認後に削除**(blobRef=null, imageDeletedAt)。番号類はマスク要請。生データ(番号/氏名/住所)はDB非保持。 |
| `lineUserId` | 高(特定子) | DB保持必須だが **API/JWT/ログに出さない**。最小権限。 |
| `birthdate` | 高 | 年齢算出のみ。**年齢は保存しない**。一覧APIは年齢のみ返し誕生日は返さない。 |
| `photoUrl` | 中 | 実体は Vercel Blob(アクセス制限)。推測困難URL/署名URL/認可配信を検討。 |
| カード情報 | 最高 | **保持しない**。Stripe に委譲。`stripePaymentIntentId`/`stripeCustomerId` のみ。 |
| `displayName`/`bio`/評価コメント | 中 | 表示用途。サニタイズ(XSS/制御文字)前提。 |
| 連絡先(電話/メール) | — | **収集しない**(通知はLINE push)。集めない=漏れない。 |
| セッションJWT | 高 | httpOnly Cookie。PIIを含めない。 |

**原則**: (a)集めない=漏れない=収集最小化 (b)機微情報は不要経路から引かない (c)暗号化(転送HTTPS/保存at-rest) (d)最小保持(身分証は承認後削除)。総合PIIレビューは S7 で security-reviewer。

## 7. 環境変数（.env / git管理外。プレースホルダで先行）

```
# LINE Login / LIFF
LINE_CHANNEL_ID=
LINE_CHANNEL_SECRET=
NEXT_PUBLIC_LIFF_ID=
# LINE Messaging API(通知)
LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=
# App session
AUTH_JWT_SECRET=
# DB(Neon)
DATABASE_URL=
DIRECT_URL=
# Blob(写真 + 身分証。身分証はアクセス制限)
BLOB_READ_WRITE_TOKEN=
# Stripe(S4)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

> 実値は殿が用意(master_plan §10。LINEは新規専用チャネル)。揃うまではモック+プレースホルダで先行。`.env` が `.gitignore` 済みであることを S1 着手時に確認。

## 8. 攻撃面チェックリスト（S1/S7で満たす）

- [ ] ID Token をサーバー検証(署名/aud/iss/exp)。クライアント申告の userId を信用しない。
- [ ] セッションは httpOnly+Secure+SameSite。JWTにPIIを入れない。
- [ ] 状態変更API に CSRF 対策(SameSite + トークン/オリジン検証)。
- [ ] admin API は role 二重チェック。権限昇格APIを作らない。
- [ ] リソースオーナー検証(IDOR防止)を全API入口で。
- [ ] 本人認証 approved ゲート(未認証は応募不可)。
- [ ] 身分証は署名URL直アップロード + 承認後削除。アクセスは本人/審査admin限定。
- [ ] 入力バリデーション/サニタイズ(Zod 等)。
- [ ] PII を含むログ出力をしない(lineUserId/誕生日/トークン/カード)。
- [ ] カード情報を自前で受け取らない(Stripe Elements/Checkout 経由)。
