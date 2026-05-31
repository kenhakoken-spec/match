// POST /api/admin/identity/[id]/ai-verdict — トリガーが AI 判定を書き戻す。
//
// トリガー駆動（spec 要望2）。ジョブが ai-queue の各項目を判定し、その結果（ok|review|ng）
// と監査用 reason をここへ POST する。サーバ側で:
//   1. setAiVerdict で監査記録。
//   2. ok かつ **18歳以上**（サーバが Profile.birthdate を再判定）のときだけ自動承認。
//      AI が ok でも 18未満 / プロフィール無しなら承認しない（安全弁）。
//   3. review / ng は pending 据え置き（運営が A-09 で確認）。
//
// 認証: トリガートークン（Authorization: Bearer）。ユーザー/管理者セッションは使わない。
import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, jsonOk, jsonError } from "@/lib/http";
import { requireTriggerToken } from "@/lib/auth/trigger-auth";
import { applyAiVerdict } from "@/lib/identity-ai";

export const dynamic = "force-dynamic";

// reason は監査用要約。長すぎる/PII 混入を避けるため上限を設ける（schema は500字）。
const bodySchema = z.object({
  verdict: z.enum(["ok", "review", "ng"]),
  reason: z.string().min(1).max(480),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return handle(async () => {
    requireTriggerToken(req);

    const raw = await req.json().catch(() => ({}));
    const { verdict, reason } = bodySchema.parse(raw);

    const result = await applyAiVerdict(params.id, verdict, reason);
    if (!result.ok) {
      return jsonError(404, "not_found", "identity verification not found");
    }

    return jsonOk({
      id: params.id,
      verdict: result.verdict,
      status: result.status,
      autoApproved: result.autoApproved ?? false,
    });
  });
}
