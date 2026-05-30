// =============================================================================
// GET /api/public/slots — 未ログイン/未登録でも見える 公開プレビュー枠一覧
//   (01_s8_spec.md 要望1: 「まず見える→制限→登録を促す」)。
//
// 認証不要。**requireUser を呼ばない**（集客のため未登録に見せる）。
// open の枠のみを日時昇順で返す。各行は toPublicSlotDTO を通すため、
// 個人特定情報（氏名/写真/lineUserId/生年月日）は構造上一切含まれない。
// 一覧は filled の人数（あと何名で成立か）までで、参加者の詳細は [id] 側で返す。
// RELEASE_MODE=waiting でもこのエンドポイントは閲覧可（公開はゲートしない）。
// =============================================================================

import { NextResponse } from "next/server";
import { handle, jsonOk } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { toPublicSlotDTO } from "@/lib/serializers";
import type { PublicSlotDTO } from "@/lib/types";

export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const repo = getRepo();
    // open のみ・datetimeStart 昇順（repo.slots.list が昇順ソート済み）。
    const slots = await repo.slots.list({ statuses: ["open"] });

    const dtos: PublicSlotDTO[] = [];
    for (const slot of slots) {
      const counts = await repo.applications.countActiveByGender(slot.id);
      dtos.push(toPublicSlotDTO(slot, counts));
    }
    return jsonOk({ slots: dtos });
  });
}
