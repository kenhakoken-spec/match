// =============================================================================
// /api/admin/slots — 運営(role=admin)による枠作成 / 全枠一覧。
// 契約: docs/backend/api-contract-s2.md §3。role=admin を **サーバ側で** 検証。
//   POST { datetimeStart, area, minAge?, maxAge?, requiresBadge? } → { slot: SlotDTO }
//   GET  → { slots: SlotDTO[] }  (全 status, 日時昇順, 状況つき)
// =============================================================================

import { NextResponse } from "next/server";
import { handle, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guard";
import { getRepo } from "@/lib/repo";
import { toSlotDTO } from "@/lib/serializers";
import { createSlotSchema } from "@/lib/validation";
import type { SlotDTO } from "@/lib/types";

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    await requireAdmin(); // admin 必須(role をDBで再検証)
    const repo = getRepo();

    const body = await req.json().catch(() => ({}));
    const input = createSlotSchema.parse(body); // zod: 不正は handle が 400 に変換

    const slot = await repo.slots.create({
      datetimeStart: new Date(input.datetimeStart),
      area: input.area,
      minAge: input.minAge ?? null,
      maxAge: input.maxAge ?? null,
      requiresBadge: input.requiresBadge ?? false,
    });

    // 作成直後は応募ゼロ。
    return jsonOk({ slot: toSlotDTO(slot, { male: 0, female: 0 }) });
  });
}

export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    await requireAdmin();
    const repo = getRepo();

    // status 指定なし = 全件(open/filled/confirmed/done/canceled)。
    const slots = await repo.slots.list();
    const dtos: SlotDTO[] = [];
    for (const slot of slots) {
      const counts = await repo.applications.countActiveByGender(slot.id);
      dtos.push(toSlotDTO(slot, counts));
    }
    return jsonOk({ slots: dtos });
  });
}
