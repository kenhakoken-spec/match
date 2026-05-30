// =============================================================================
// matching-app — POST /api/ratings/_dev-seed（**dev/MOCK 専用** 評価テスト用 seed）
// 契約§4: 「done 済イベント + 同席6名を rating-repo 側の補助で用意」の HTTP トリガ。
//
// done を作る admin ルートが S5 時点で存在しないため、評価フロー(§5 curl)を回すには
// done Slot + 6名 accepted を in-memory に用意する必要がある。memory.ts は触らない方針なので、
// rating-repo.seedDoneEventForTest() が共有 in-memory ストアへ最小データを追記する。
//
// **本番では 404**（isMockAuthEnabled()=false で無効）。フェイルクローズ。
// MOCK_DB=0（実DB）では seedDoneEventForTest が no-op（IDだけ返す）。
// =============================================================================

import { handle, jsonOk, jsonError } from "@/lib/http";
import { isMockAuthEnabled } from "@/lib/env";
import { seedDoneEventForTest } from "@/lib/repo/rating-repo";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  return handle(async () => {
    // dev/MOCK 専用。実認証(本番)では存在を漏らさず 404。
    if (!isMockAuthEnabled()) {
      return jsonError(404, "not_found", "not found");
    }
    const seeded = seedDoneEventForTest();
    return jsonOk(seeded);
  });
}
