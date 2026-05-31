// =============================================================================
// matching-app — 本人認証 AI 一次判定の「適用」サービス（トリガー駆動・spec 要望2）
//
// トリガージョブが書き戻した AI 判定（ok|review|ng）を受け取り、**サーバ側で**:
//   1. 判定根拠を監査記録（setAiVerdict）。
//   2. 明白OK(ok) かつ **18歳以上** のときだけ自動承認（approve）＋申請者へ通知。
//      ※ AI が ok でも 18歳未満 / プロフィール未作成なら **絶対に承認しない**（安全弁）。
//   3. review / ng は pending 据え置き（運営が A-09 で確認・ng は reject 操作）。
//
// 「判定」と「承認」を分離し、年齢の最終責任はトリガーの自己申告でなく **サーバ側で
// Profile.birthdate を再判定** する。これが出会い系規制の年齢確認の肝。
// =============================================================================
import "server-only";
import { getRepo } from "@/lib/repo";
import { isAdult } from "@/lib/domain/age";
import { sendNotification } from "@/lib/notify-mock";
import type { IdentityAiVerdict, IdentityStatus } from "@/lib/types";

export interface ApplyAiVerdictResult {
  ok: boolean;
  /** 見つからない等のエラーコード（ok=false のとき）。 */
  code?: "not_found";
  /** 適用後の本人認証ステータス。 */
  status?: IdentityStatus;
  /** 記録された判定。 */
  verdict?: IdentityAiVerdict;
  /** この呼び出しで自動承認したか（冪等: 既に承認済みなら false）。 */
  autoApproved?: boolean;
}

/**
 * トリガーが書き戻した AI 判定を適用する。
 *
 * @param id      IdentityVerification の id（キュー項目の id）。
 * @param verdict ok|review|ng。
 * @param reason  監査記録用の要約（PII・画像生データ・秘密値を含めない）。
 */
export async function applyAiVerdict(
  id: string,
  verdict: IdentityAiVerdict,
  reason: string
): Promise<ApplyAiVerdictResult> {
  const repo = getRepo();

  const iv = await repo.identities.findById(id);
  if (!iv) return { ok: false, code: "not_found" };

  // 1. 判定根拠を必ず記録（監査）。status は変えない＝判定と承認の分離。
  await repo.identities.setAiVerdict(id, verdict, reason);

  // 既に pending でない（承認済/却下済）なら、状態は動かさず冪等に返す。
  if (iv.status !== "pending") {
    return { ok: true, status: iv.status, verdict, autoApproved: false };
  }

  // 2. 明白OK のみ自動承認。ただし **18歳安全弁** をサーバ側で二重チェック。
  if (verdict === "ok") {
    const profile = await repo.profiles.findByUserId(iv.userId);
    if (profile && isAdult(profile.birthdate, new Date())) {
      const approved = await repo.identities.approve(id, "ai");
      if (approved) {
        // 自動承認も運営承認時と同じ通知（payload は運用情報のみ・PII/画像/秘密値なし）。
        await sendNotification({
          userId: approved.userId,
          type: "identity_approved",
          slotId: null,
          matchId: null,
          payload: { reviewedBy: "ai" },
        });
        return {
          ok: true,
          status: approved.status, // "approved"
          verdict,
          autoApproved: true,
        };
      }
    }
    // ok でも 18未満 / プロフィール無し / approve 失敗 → 承認しない（pending 据え置き）。
  }

  // 3. review / ng / 安全弁で弾いた ok → pending のまま（運営確認へ）。
  return { ok: true, status: "pending", verdict, autoApproved: false };
}
