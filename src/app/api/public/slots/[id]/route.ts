// =============================================================================
// GET /api/public/slots/[id] — 未ログインでも見える 公開プレビュー枠詳細
//   (01_s8_spec.md 要望1: 参加者の「すごさ」を匿名サマリで見せる)。
//
// 認証不要。**requireUser を呼ばない**。枠 + 参加者を返すが、参加者は
// PublicMemberDTO（職種 / 年代band / 多軸評価 / 優良バッジ のみ）に限る。
// 生の Profile/User は決してそのまま返さず、必ず toPublicMemberDTO を経由する
// （氏名 / displayName / photoUrl / lineUserId / 正確な生年月日 は構造上含まれない）。
// 存在しない枠は 404（存在を素直に返す。公開リソースなので IDOR 配慮は不要）。
// =============================================================================

import { NextResponse } from "next/server";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { toPublicSlotDTO, toPublicMemberDTO } from "@/lib/serializers";
import type { PublicMemberDTO, PublicSlotDetailDTO } from "@/lib/types";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  return handle(async () => {
    const { id } = await ctx.params;
    const repo = getRepo();

    const slot = await repo.slots.findById(id);
    if (!slot) {
      // 公開リソース。存在しなければ素直に 404（IDOR 配慮は不要）。
      return jsonError(404, "slot_not_found", "slot not found");
    }

    const counts = await repo.applications.countActiveByGender(slot.id);

    // 有効応募（applied/accepted）の参加者を匿名サマリで。
    const apps = await repo.applications.listActiveBySlot(slot.id);
    const members: PublicMemberDTO[] = [];
    for (const app of apps) {
      const profile = await repo.profiles.findByUserId(app.userId);
      if (!profile) continue; // プロフィール未完成は表示しない（防御）。
      const hasPremiumBadge = await repo.badges.hasPremium(app.userId);
      members.push(toPublicMemberDTO(profile, hasPremiumBadge));
    }

    const detail: PublicSlotDetailDTO = {
      ...toPublicSlotDTO(slot, counts),
      members,
    };
    return jsonOk(detail);
  });
}
