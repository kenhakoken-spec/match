// PUT /api/profile — プロフィール作成/更新(upsert)。本人のみ(IDOR防止)。
// 18歳以上をサーバ検証。未満は 400 code:"under_age"。契約§2。
import { NextRequest } from "next/server";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { requireUser } from "@/lib/auth/guard";
import { profileSchema } from "@/lib/validation";
import { isAdult } from "@/lib/domain";
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
    const profile = await repo.profiles.upsertByUserId({
      userId: authed.id,
      gender: input.gender,
      birthdate,
      areaPref: input.areaPref,
      bio: input.bio ?? null,
    });

    const dto = { ...toProfileDTO(profile), displayName: input.displayName };
    return jsonOk({ profile: dto });
  });
}
