# セキュリティ OPEN issues 追跡（開発将軍）

S1+S2 セキュリティレビュー結果（2026-05-30, security-reviewer）。**CRITICAL 0 / HIGH 2 / MEDIUM 4 / LOW 4**。
総評: 認証・認可・IDOR・PII・原子性はMVPとして水準以上に堅牢。以下は本番env接続前に固めるべき前提が中心（現状モックで実害なし）。

## 対応方針（いつ直すか）

| ID | 重大度 | 概要 | 対応時期 | 状態 |
|----|--------|------|----------|------|
| SEC-001 | HIGH | モック群がフェイルオープン既定（本番env漏れでadmin乗っ取り） | **S2直後に即修正** | ✅FIXED (2026-05-30, env.ts集約フェイルクローズ+本番dev-login404, 実証curl(a)200/(b)(c)404, +単体テスト6+2) |
| SEC-002 | HIGH | LINE実トークン検証が未実装（本番化ブロッカー） | **S2直後にガード追加**、実装はLINE接続時 | ✅FIXED (2026-05-30, 本番モードで実検証未実装なら503 throw=モック黙フォールバック禁止, 実装はLINE接続時TODO, +単体テスト3) |
| SEC-003 | MED | CSRFが sameSite=lax のみ（Origin/Referer未検証） | S3（通知接続前） | OPEN |
| SEC-004 | MED | レート制限なし（総当たり/アップロード濫用/応募連打） | S3〜S4 | OPEN |
| SEC-005 | MED | ファイル種別がMIME申告依存・空typeで素通り（マジックバイト未検証） | S4（実Blob接続時） | OPEN |
| SEC-006 | MED | 身分証blobRefの所有者バインドが弱い（submitが任意blobRef受理） | S4（実Blob接続時） | OPEN |
| SEC-007 | LOW | セッション鍵導出が単純ハッシュ・秘密長未検証 | S7 | OPEN |
| SEC-008 | LOW | Next 14.2.5（CVE-2025-29927、ただしmiddleware無しで悪用不可） | S7（next更新・低コスト） | OPEN |
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
