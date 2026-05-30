// =============================================================================
// matching-app — 本人認証の AI(Haiku)一次判定。S8 要望2。
//
// 身分証画像から ①18歳以上か ②顔写真の有無 ③記載の読取 を判定し、
// OK(=明白に問題なし) / review(=グレー・運営確認) / NG(=却下相当) を返す。
// 運用方針(spec 要望2): AI一次判定 → 明白OKは自動承認・グレーのみ運営確認。
// 出会い系規制の年齢確認責任は重いため、**判定根拠(reason)を必ず記録**して監査可能にする。
//
// セキュリティ:
//  - 入力の画像参照(blobRef)・base64・APIキー等の秘密値を **ログ/レスポンス/reason に
//    一切出さない**。判定は構造化データ(docType / birthdate)のみで行い、理由文は
//    人間可読の要約に留める(個人特定情報・画像内容の生データを含めない)。
//  - 実 Haiku 未接続時は MOCK_AI(既定 ON・非production)で **決定的なモック**判定。
//  - 本番(production)では実検証へ。未実装の現状は黙ってモックへ落とさず明示 throw
//    (なりすまし/誤承認防止のフェイルクローズ。line-mock の SEC-002 と同方針)。
// =============================================================================
import "server-only";
import { isAdult } from "@/lib/domain/age";
import type { IdentityAiVerdict, IdDocType } from "@/lib/types";

/**
 * AI 一次判定の入力。**構造化データのみ**。
 * - docType: 身分証の種別(読取可能性の目安)。
 * - blobRef: 画像の参照キー。**判定に内容は使わず、ログ/reason にも出さない**
 *   (モックでは「読取不能を示す決定的マーカー」を blobRef 文字列から検知するためだけに参照)。
 * - birthdate: 申請プロフィールの生年月日。18+ 判定に使う(サーバ側の二重チェックにも)。
 */
export interface VerifyIdentityInput {
  docType: IdDocType;
  blobRef: string;
  birthdate: Date;
}

/** AI 一次判定の結果。verdict と監査用 reason。secret/画像生データは含めない。 */
export interface VerifyIdentityResult {
  verdict: IdentityAiVerdict;
  /** 監査記録用の人間可読な根拠(PII・画像内容・秘密値を含めない)。 */
  reason: string;
}

/** AI 一次判定が安全に実行できない(実Haiku未実装の本番など)ことを表す明示エラー。 */
export class HaikuVerificationUnavailableError extends Error {
  status = 503;
  code = "ai_verification_unavailable";
  constructor(message = "AI identity verification (Haiku) is not configured") {
    super(message);
    this.name = "HaikuVerificationUnavailableError";
  }
}

/**
 * AI モック判定が有効か(フェイルクローズ)。
 * - 本番(NODE_ENV==="production"): 常に false(実検証へ。MOCK_AI を無視)。
 * - 非production: 既定 ON。`MOCK_AI=0` を明示したときだけ OFF。
 * env.ts の mockFlag と同方針(本番無効化が主目的・開発側は既定 ON)。
 */
export function isMockAiEnabled(): boolean {
  if ((process.env.NODE_ENV ?? "development") === "production") return false;
  return process.env.MOCK_AI !== "0";
}

/**
 * blobRef に「読取不能/顔写真なしを示す決定的マーカー」が含まれるか。
 * **モックの決定性のためだけ**に blobRef 文字列を検査する(画像内容は見ない)。
 * テスト/開発で review 分岐を再現できるよう、参照キーに以下の語を含めると review 扱い:
 *   - "blurry" / "unreadable" / "noface"
 * これは実Haiku接続時には不要になる(実画像解析に置き換わる)。
 */
function blobRefSignalsUnreadable(blobRef: string): boolean {
  const lowered = blobRef.toLowerCase();
  return (
    lowered.includes("blurry") ||
    lowered.includes("unreadable") ||
    lowered.includes("noface")
  );
}

/**
 * 決定的モック判定。**同じ入力には常に同じ verdict/reason** を返す(乱数なし)。
 * 判定ロジック(spec の ①18+ ②顔写真有無 ③読取 を模す):
 *  1. 18歳未満(birthdate) → **ng**(年齢確認の安全弁。AI段階でも弾く)。
 *  2. blobRef が読取不能/顔写真なしマーカーを含む → **review**(運営確認)。
 *  3. 18+ かつ読取良好 → **ok**(明白OK=自動承認候補)。
 * reason は監査用の要約のみ(blobRef/PII/画像生データは出さない)。
 */
function mockVerify(input: VerifyIdentityInput): VerifyIdentityResult {
  // ① 18歳未満は AI 段階で ng(最終責任が重いので明確に弾く)。
  if (!isAdult(input.birthdate, new Date())) {
    return {
      verdict: "ng",
      reason: "AI(mock): 記載の生年月日が18歳未満のため不可。",
    };
  }

  // ② 読取不能 / 顔写真なしと判断 → グレー(運営確認)。
  if (blobRefSignalsUnreadable(input.blobRef)) {
    return {
      verdict: "review",
      reason:
        "AI(mock): 画像が不鮮明、または顔写真が確認できないため要確認(運営判断)。",
    };
  }

  // ③ 18歳以上・顔写真あり・記載読取良好 → 明白OK(自動承認候補)。
  return {
    verdict: "ok",
    reason: `AI(mock): 18歳以上・顔写真あり・記載読取良好(docType=${input.docType})。`,
  };
}

/**
 * 実 Haiku による本人認証一次判定(未実装)。
 *
 * 実 Anthropic API(Haiku)接続時に **必ず** 実装する。それまでは、誤承認/なりすまし
 * を防ぐため黙ってモックへフォールバックせず {@link HaikuVerificationUnavailableError}
 * を throw する(route 側で 503 として扱う)。
 *
 * TODO(実Haiku接続時に実装):
 *   1. APIキーは **env 経由**(例 `process.env.ANTHROPIC_API_KEY`)。コードに固定しない・
 *      ログ/レスポンスに出さない。env.ts に集約してから読む。
 *   2. 身分証画像(blobRef から取得)を Anthropic Messages API(model: claude-haiku 系)or
 *      WebFetch 相当へ渡し、構造化プロンプトで ①18歳以上か ②顔写真の有無
 *      ③記載(氏名/生年月日)の読取可否 を判定させ、{ verdict, reason } を JSON で受け取る。
 *   3. 受け取った verdict を ok|review|ng に正規化。reason には **画像生データ/PII/秘密値を
 *      含めない**(要約のみ)。判定不能・API エラー時は安全側に倒し review を返す
 *      (ok を勝手に出して自動承認しない)。
 *   4. birthdate による 18+ チェックはサーバ側でも二重に行う(本ファイル外・route 側の安全弁)。
 */
function realVerify(_input: VerifyIdentityInput): VerifyIdentityResult {
  throw new HaikuVerificationUnavailableError(
    "real Haiku identity verification is not implemented yet; " +
      "connect the Anthropic API (key via env) and implement the structured age/face/readability check"
  );
}

/**
 * 本人認証画像の AI 一次判定。モード別ディスパッチャ。
 * - モック有効(非production既定): 決定的モック。
 * - モック無効(本番): 実検証(未実装なら throw)。
 *
 * **判定のみを返す**。setAiVerdict での記録・明白OKの自動承認は呼び出し側(route)が行う
 * (判定と承認を分離。年齢の最終責任が重いため route 側でも 18+ を二重チェックする)。
 */
export async function verifyIdentityImage(
  input: VerifyIdentityInput
): Promise<VerifyIdentityResult> {
  if (isMockAiEnabled()) {
    return mockVerify(input);
  }
  return realVerify(input);
}
