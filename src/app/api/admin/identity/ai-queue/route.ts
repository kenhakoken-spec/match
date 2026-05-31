// GET /api/admin/identity/ai-queue — 本人認証 AI 一次判定の「判定待ちキュー」。
//
// トリガー駆動（spec 要望2 をトリガー方式へ）。モーニングレポートと同様に、外部トリガーで
// 起動したジョブ（tools/ai-identity-trigger.mjs）がこのキューを取得し、各項目を判定して
// /api/admin/identity/[id]/ai-verdict へ書き戻す。
//
// 認証: ユーザーセッションでなく **トリガートークン**（Authorization: Bearer）。
// 返すのは判定に必要な最小データのみ（id / docType / blobRef / birthdate）。
//   - 氏名・lineUserId 等の PII は返さない（年齢判定に birthdate は必要なため含める）。
//   - blobRef は画像参照（トリガーが画像を取得して判定する想定。実体はサーバに溜めない）。
import { NextRequest } from "next/server";
import { handle, jsonOk } from "@/lib/http";
import { requireTriggerToken } from "@/lib/auth/trigger-auth";
import { getRepo } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    requireTriggerToken(req);

    const repo = getRepo();
    // pending のうち「未判定 or 再提出（前回判定より後に提出された）」を判定待ちとする。
    // submit() が aiVerdict を null にリセットすれば aiVerdict===null で拾える。
    // リセットされない実装でも、aiCheckedAt < submittedAt（再提出が判定より新しい）で拾う。
    const pending = await repo.identities.listByStatus("pending");
    const awaiting = pending.filter((iv) => {
      if (iv.aiVerdict === null || iv.aiVerdict === undefined) return true;
      if (iv.aiCheckedAt && iv.submittedAt && iv.aiCheckedAt < iv.submittedAt) return true;
      return false;
    });

    const items = [];
    for (const iv of awaiting) {
      // 18+ 判定に生年月日が要る。プロフィール未作成は判定不能としてキューから除外
      //（トリガーが ok を出しても安全弁で承認されないので、無駄判定を避ける）。
      const profile = await repo.profiles.findByUserId(iv.userId);
      if (!profile) continue;
      items.push({
        id: iv.id,
        docType: iv.docType,
        blobRef: iv.blobRef, // 画像参照（PIIではない参照キー）
        birthdate: profile.birthdate.toISOString(),
      });
    }

    return jsonOk({ items });
  });
}
