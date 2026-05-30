// =============================================================================
// POST /api/slots/[id]/apply — 応募。3ゲートを **サーバ側で再検証** して通過時のみ作成。
// 契約: docs/backend/api-contract-s2.md §2,§4 / matching-logic.md §4。
//   成功: { application: { status: "applied" } }
//   不可: 409 { error: { code, message, reasons } }
//
// セキュリティ要点:
//  - クライアントの canApply を **信用しない**。evaluateEligibility(純関数)で再判定。
//  - 過充足/二重応募は repo.applyAtomic の不可分区間(in-memory)/TX+行ロック(Prisma)で防止。
//  - 応募者は **セッションの sub** で解決(body/URL の userId を信用しない = IDOR防止)。
// =============================================================================

import { NextResponse } from "next/server";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { requireUser } from "@/lib/auth/guard";
import { getRepo } from "@/lib/repo";
import { buildSlotContext } from "@/lib/slot-service";
import { finalizeMatchOnApply } from "@/lib/match-service";
import type { EligibilityReasonCode } from "@/lib/types";

/** 応募不可の 409。理由配列を必ず添える(契約§2)。 */
function applyConflict(
  reasons: EligibilityReasonCode[],
  message = "application not allowed"
): NextResponse {
  return NextResponse.json(
    { error: { code: "not_eligible", message, reasons } },
    { status: 409 }
  );
}

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  return handle(async () => {
    const me = await requireUser();
    const repo = getRepo();

    const slot = await repo.slots.findById(params.id);
    if (!slot) {
      return jsonError(404, "not_found", "slot not found");
    }

    // --- ゲート再検証(サーバ側の真実)。クライアント申告は一切使わない。---
    const ctx = await buildSlotContext(slot, me.id);
    if (!ctx.eligibility.canApply) {
      return applyConflict(ctx.eligibility.reasons);
    }

    // プロフィール完成(eligibility 通過済 = gender 確定)を前提に gender を解決。
    const profile = await repo.profiles.findByUserId(me.id);
    if (!profile) {
      // 通常ここには来ない(profile_required で上で弾かれる)が、防御的に。
      return applyConflict(["profile_required"]);
    }

    // --- 原子的作成(状態/二重/定員を不可分に再判定)。クライアント値に依存しない。---
    const result = await repo.applications.applyAtomic(
      { slotId: slot.id, userId: me.id, gender: profile.gender },
      slot.capacityPerGender
    );

    if (result.error) {
      // applyAtomic のエラーは eligibility の reason 語彙へ写像して 409。
      // (index-access に依存せず明示 switch。noUncheckedIndexedAccess の有無に堅牢。)
      switch (result.error) {
        case "slot_not_found":
          return jsonError(404, "not_found", "slot not found");
        case "slot_closed":
          return applyConflict(["slot_closed"]);
        case "already_applied":
          return applyConflict(["already_applied"]);
        case "gender_full":
          return applyConflict(["gender_full"]);
        default: {
          // 網羅性チェック(未知 error が増えたらコンパイルエラーで気付く)。
          const _exhaustive: never = result.error;
          void _exhaustive;
          return jsonError(500, "internal_error", "internal server error");
        }
      }
    }

    // 応募作成時点の status を保持（下の成立確定でentityがacceptedに変わっても
    // 応募レスポンスは S2 契約どおり "applied" を返すため）。
    const appliedStatus = result.application!.status;

    // --- S3: 成立確定（枠が filled になった瞬間）。---
    // applyAtomic が matched を返した = 男女各 cap 充足。Match 生成 + 6名 accepted +
    // 運営内部通知(match_to_admin) を冪等に実行する。決済確定(S4)はここでは扱わない。
    // 成立処理の失敗で応募自体を 500 にしないよう、例外は飲み込み matched は応募結果として返す。
    if (result.matched) {
      try {
        await finalizeMatchOnApply(slot.id);
      } catch {
        // NotificationLog 等の副作用失敗は応募成功を覆さない（再送/再実行で回復可能）。
        // 詳細は内部ログのみ（PII/内部詳細はレスポンスに出さない）。
      }
    }

    return jsonOk({
      application: { status: appliedStatus },
      matched: result.matched,
    });
  });
}
