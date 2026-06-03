// PUT /api/profile — プロフィール作成/更新(upsert)。本人のみ(IDOR防止)。
// 18歳以上をサーバ検証。未満は 400 code:"under_age"。契約§2。
import { NextRequest } from "next/server";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { requireUser } from "@/lib/auth/guard";
import { profileSchema } from "@/lib/validation";
import { isAdult, sanitizeOccupationText } from "@/lib/domain";
import { getRepo } from "@/lib/repo";
import { toProfileDTO } from "@/lib/serializers";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const authed = await requireUser(); // セッションの user を唯一の所有者とする
    const body = await req.json().catch(() => ({}));
    const input = profileSchema.parse(body);

    const birthdate = new Date(input.birthdate + "T00:00:00.000Z");
    // 18+ をサーバ検証(本人認証で目視確認するが入力段でも弾く)。
    if (!isAdult(birthdate, new Date())) {
      return jsonError(400, "under_age", "must be 18 years or older");
    }

    const repo = getRepo();
    // userId は **セッション由来**。body/URL の userId は受け取らない(IDOR防止)。
    // S12 #6/#8: 職業自由入力(サニタイズ)・アイコン識別子を保存。未指定は既存値維持
    // (upsert 側が undefined を部分更新としてスキップする)。
    const profile = await repo.profiles.upsertByUserId({
      userId: authed.id,
      gender: input.gender,
      birthdate,
      areaPref: input.areaPref,
      bio: input.bio ?? null,
      occupationText:
        input.occupationText !== undefined
          ? sanitizeOccupationText(input.occupationText)
          : undefined,
      iconKey: input.iconKey !== undefined ? input.iconKey : undefined,
    });

    const dto = { ...toProfileDTO(profile), displayName: input.displayName };
    return jsonOk({ profile: dto });
  });
}
