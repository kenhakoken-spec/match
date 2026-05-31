# セキュリティ OPEN issues 追跡（開発将軍）

S1+S2 セキュリティレビュー結果（2026-05-30, security-reviewer）。**CRITICAL 0 / HIGH 2 / MEDIUM 4 / LOW 4**。
総評: 認証・認可・IDOR・PII・原子性はMVPとして水準以上に堅牢。以下は本番env接続前に固めるべき前提が中心（現状モックで実害なし）。

## 対応方針（いつ直すか）

| ID | 重大度 | 概要 | 対応時期 | 状態 |
|----|--------|------|----------|------|
| SEC-001 | HIGH | モック群がフェイルオープン既定（本番env漏れでadmin乗っ取り） | **S2直後に即修正** | ✅FIXED (2026-05-30, env.ts集約フェイルクローズ+本番dev-login404, 実証curl(a)200/(b)(c)404, +単体テスト6+2) |
| SEC-002 | HIGH | LINE実トークン検証が未実装（本番化ブロッカー） | **S2直後にガード追加**、実装はLINE接続時 | ✅FIXED (2026-05-31, **実装完了**: `src/lib/auth/line-verify.ts` が LINE verify API で iss/aud(=Channel ID)/exp/sub を検証。Channel ID 未設定は503フェイルクローズ。`/api/auth/line` が await 検証→セッション発行。+単体テスト7。LIFFクライアント結線も実装(`src/app/_lib/liff-login.ts`)) |
| SEC-003 | MED | CSRFが sameSite=lax のみ（Origin/Referer未検証） | S3（通知接続前） | ✅FIXED (2026-05-31, `src/middleware.ts`+`src/lib/security/origin.ts`。状態変更メソッドのみ Origin/Referer 検証・許可=同一オリジン+ALLOWED_ORIGINS・Bearer/webhook除外・本番はOrigin欠如を403・+23テスト) |
| SEC-004 | MED | レート制限なし（総当たり/アップロード濫用/応募連打） | S3〜S4 | ✅FIXED (2026-05-31, `src/lib/security/rate-limit.ts` 固定窓(60s) IP×カテゴリ。auth20/identity10/venues-suggest10/apply30/他120・429+Retry-After・Bearer/webhook除外・+23テスト。多インスタンス本番はRedis等へ要差替=コメント明記) |
| SEC-005 | MED | ファイル種別がMIME申告依存・空typeで素通り（マジックバイト未検証） | S4（実Blob接続時） | OPEN |
| SEC-006 | MED | 身分証blobRefの所有者バインドが弱い（submitが任意blobRef受理） | S4（実Blob接続時） | OPEN |
| SEC-007 | LOW | セッション鍵導出が単純ハッシュ・秘密長未検証 | S7 | OPEN |
| SEC-008 | LOW | Next 14.2.5（CVE-2025-29927）。S8で middleware を追加したため悪用面が出る | next更新（14.2.25+） | ⚠️MITIGATED (2026-05-31, `src/middleware.ts` が受信リクエストから `x-middleware-subrequest` を除去して暫定緩和。恒久対応は Next 14.2.25+ への更新) |
| SEC-009 | LOW | 監査ログなし（OWASP A09） | S7 | OPEN |
| SEC-010 | LOW | admin審査キューがcuid返却（妥当・現状維持可） | 対応不要 | NOTED |

## S2直後に即修正する2件（backend-workerへ委任）

### SEC-001 フェイルクローズ化
- `src/lib/auth/line-mock.ts` `isMockAuth()`、`src/lib/auth/session.ts:44`(鍵フォールバック)、MOCK_DB/MOCK_NOTIFY を含むモック群の既定を **「`==="1"` かつ `NODE_ENV!=="production"`」** に統一（`env.ts` の集約フラグに寄せる）。
- `src/app/api/auth/dev-login/route.ts` 冒頭で `if (process.env.NODE_ENV==="production") return 404`。
- 本番では `MOCK_AUTH=1` を**無視して常に無効**。

### SEC-002 本番LINE検証ガード
- `MOCK_AUTH=0`（実モード）かつ LINE実トークン検証（署名/aud=Channel ID/iss/exp）が未実装の場合、`/api/auth/line` は実検証を試み、未実装なら**起動時 or 呼び出し時に明示エラー**（なりすまし防止）。実検証の実装自体はLINEチャネル接続時（S3前後）。

## 良好な統制（再指摘不要・回帰させない）
セッションAES-256-GCM(authTag改竄検知/httpOnly/secure/sameSite/1h/PII不在)、IDOR所有者=セッションsub解決、requireAdminのDB再検証、PII出口関門(lineUserId非露出)、身分証approve/reject両方でblobRef=null+imageDeletedAt、応募の3ゲートサーバ再判定+applyAtomic($transaction+FOR UPDATE+unique)、role昇格防止(create時のみrole設定)、zod検証、Prisma typed APIでSQLi耐性、.env系gitignore・秘密ハードコード無し、Paymentにカード情報非保持。

---

## S8 セキュリティレビュー結果（2026-05-31, security-reviewer ＋ 開発将軍が file:line で独立再確認）

S8追加機能（プレビュー / AI認証 / 多軸評価 / ドタキャン罰金 / 会場候補）の総合レビュー。**CRITICAL 0 / HIGH 0 / 新規LOW 1**。本番投入をブロックする新規脆弱性なし。

観点別（すべて OK）:
- **① Haiku AI認証**: 自動承認は `ai.verdict==="ok" && isAdult(profile.birthdate, …)` の**両立必須**（`identity/route.ts:54`）。AIがokでも18歳未満は却下（安全弁）。`aiVerdict`/`aiReason`/`aiCheckedAt` を監査記録。申請者はセッションsub（`requireUser()`→`authed.id`）、birthdateはサーバ保持Profile（body非依存）。本番で実Haiku未接続なら throw（黙ってモックに落ちない）。
- **② ドタキャン罰金**: `isNoShowConfirmed`(>=2)。`noshow-service` が**現accepted参加者の報告のみ**集計＋自己申告除外。rater=セッションsub（`ratings/route.ts:34`）。課金対象はサーバ側accepted集合から解決（IDORなし）。冪等 `findBySlotUserAndType`。
- **③ プレビューPII**: 公開2経路とも `toPublicSlotDTO`/`toPublicMemberDTO` 経由（`public/slots/route.ts:27`・`[id]/route.ts:41,45`）。生Profile/User返却なし。`PublicMemberDTO`は5フィールドのみ・年代band止まり。
- **④ admin認可**: `api/admin/**` 全ルートが `requireAdmin()`（DBでrole再読込）。venues choose/reject/suggest も先頭ガード。venueUrlは http(s) 許可リスト。
- **⑤ 限定枠**: 応募owner=セッションsub。`buildSlotContext`が実hasPremium/実birthdateで `evaluateEligibility` 再判定（なりすまし応募を server で弾く）。

> security-reviewer 初稿の「プレビュー生Prisma漏洩(CRIT)」「no-show二重課金(HIGH)」は WSL の空Read由来の誤検知で、実コード(nl -ba)確認により**両方とも該当コード無し＝撤回**。開発将軍も grep/Read で independently 再確認（公開は全DTO経由・罰金は冪等・18+安全弁あり）。

| ID | 重大度 | 概要 | 対応時期 | 状態 |
|----|--------|------|----------|------|
| SEC-011 | LOW | Payment に複合一意制約 `@@unique([slotId,userId,type])` が無い。罰金の冪等は現状 in-memory の逐次チェック依存。実DB(Prisma)接続時に2人目の報告がレースすると二重Payment行の可能性 | 実DB化前（schema追加 ＋ create時 P2002 を冪等スキップ） | ⚠️PARTIAL (2026-05-31, `prisma/schema.prisma` Payment に `@@unique([slotId,userId,type])` を**追加済**。残: 実DB接続時に create の P2002 を冪等スキップへ変換。in-memory は従来どおり `findBySlotUserAndType` で冪等=実害なし) |

---

## 本人認証 AI 一次判定 — トリガー駆動で実装（2026-05-31）

殿の方針: Haiku を Anthropic API で同期に叩かず、モーニングレポートと同じく**トリガー駆動**にする。
→ 実装済み。設計・契約・セキュリティの正典は `docs/AI_IDENTITY_TRIGGER.md`。

- `POST /api/identity` は提出のみ（pending・AIは同期で呼ばない）。
- トリガージョブ（`tools/ai-identity-trigger.mjs`）が `GET /api/admin/identity/ai-queue`（Bearer）で
  判定待ちを取得→判定→`POST /api/admin/identity/[id]/ai-verdict`（Bearer）で書き戻し。
- サーバ側 `applyAiVerdict` が監査記録＋**ok かつ 18歳以上のみ自動承認**（安全弁）。review/ng は運営確認。
- 認証トークン `AI_TRIGGER_TOKEN` は本番未設定で 503（フェイルクローズ）。比較は定数時間。
- middleware は Bearer リクエストを CSRF/レート制限から除外（トリガーが弾かれない）。
- 本番では `judge()` を実トリガーAI判定へ差し替え（現状は決定的ルールのプロトタイプ）。

> **S8でCSRF/レート制限の面が拡大**: SEC-003（Origin/Referer未検証）と SEC-004（レート制限なし）は、S8で増えた `/api/ratings`（罰金確定の起点）・`/api/identity`（AI判定を毎回呼ぶ＝将来コスト/濫用面）・`/api/admin/venues/suggest` を含めて本番前に対応する。新規ID化はせず SEC-003/004 に内包。
> 本番前 必須対応の最終リスト: SEC-002（実LINEトークン検証の実装）/ 実Haiku接続（reasonにPII・秘密値を入れない・判定不能は review）/ SEC-011（Payment複合unique）/ SEC-003・SEC-004 / SEC-009（AI自動承認・罰金課金の監査ログ）。
