// =============================================================================
// GET /api/slots — 募集中の枠一覧(open中心, 日時昇順)。?area=&from=&to= 任意。
// 契約: docs/backend/api-contract-s2.md §2。Res: { slots: SlotDTO[] }
// 認証必須(未ログインは401)。一覧自体は eligibility を含めない(詳細で付す)。
// =============================================================================

import { NextResponse } from "next/server";
import { handle, jsonOk } from "@/lib/http";
import { requireUser } from "@/lib/auth/guard";
import { getRepo } from "@/lib/repo";
import { toSlotDTO } from "@/lib/serializers";
import { AREAS, type Area, type SlotDTO } from "@/lib/types";

function parseArea(v: string | null): Area | undefined {
  if (v && (AREAS as readonly string[]).includes(v)) return v as Area;
  return undefined;
}

function parseDate(v: string | null): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    await requireUser(); // ログイン必須
    const repo = getRepo();
    const url = new URL(req.url);

    const slots = await repo.slots.list({
      statuses: ["open"], // 募集中のみ
      area: parseArea(url.searchParams.get("area")),
      from: parseDate(url.searchParams.get("from")),
      to: parseDate(url.searchParams.get("to")),
    });

    const dtos: SlotDTO[] = [];
    for (const slot of slots) {
      const counts = await repo.applications.countActiveByGender(slot.id);
      dtos.push(toSlotDTO(slot, counts));
    }
    return jsonOk({ slots: dtos });
  });
}
