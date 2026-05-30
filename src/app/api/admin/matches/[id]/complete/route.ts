// =============================================================================
// POST /api/admin/matches/[id]/complete — 開催完了（admin成立完了アクション）。
//   対象 Match の Slot を done に遷移し、accepted 参加者全員の attendedCount を +1。
//   これで「開催完了 → 評価可能(done Slot) → バッジ判定(attendedCount)」の前提が
//   実フローで揃う（横断配線 §5 / badge.md §3 の attendedCount 入力）。
//   role=admin を **サーバ側で** 検証。
//   - Match が無い → 404。
//   - notified 済みのときのみ可（pending_venue / venue_set は未通知 → 409）。
//   - canceled は 409。
//   Res: { slotStatus: "done", attendedIncremented: <人数> }
// =============================================================================

import { NextResponse } from "next/server";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guard";
import { getRepo } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  return handle(async () => {
    await requireAdmin(); // admin 必須（role をサーバ側再検証）。

    const repo = getRepo();
    const match = await repo.matches.findById(params.id);
    if (!match) {
      return jsonError(404, "not_found", "match not found");
    }
    if (match.status === "canceled") {
      return jsonError(409, "match_canceled", "match is canceled");
    }
    // 通知が完了した成立のみ「開催完了」にできる（未通知の done 化を防ぐ）。
    if (match.status !== "notified") {
      return jsonError(409, "not_notified", "match must be notified before completion");
    }

    const slot = await repo.slots.findById(match.slotId);
    if (!slot) {
      return jsonError(404, "not_found", "slot not found");
    }

    // 既に done なら冪等にエラー（二重カウント防止: attendedCount を再加算しない）。
    if (slot.status === "done") {
      return jsonError(409, "already_done", "slot already completed");
    }

    // Slot → done。
    const updated = await repo.slots.setStatus(slot.id, "done");
    if (!updated) {
      return jsonError(404, "not_found", "slot not found");
    }

    // accepted 参加者全員の attendedCount を +1（バッジ判定の入力）。
    const active = await repo.applications.listActiveBySlot(slot.id);
    const accepted = active.filter((a) => a.status === "accepted");
    let attendedIncremented = 0;
    for (const a of accepted) {
      const p = await repo.profiles.incrementAttended(a.userId);
      if (p) attendedIncremented += 1;
    }

    return jsonOk({ slotStatus: "done", attendedIncremented });
  });
}
