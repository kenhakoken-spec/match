// =============================================================================
// matching-app — Repository factory (契約§0 / SEC-001)
// 非production: in-memory(既定 / MOCK_DB=0 で Prisma)。
// 本番(NODE_ENV==="production"): MOCK_DB の値に関わらず **常に Prisma(実DB)**。
//   判定は env.ts に集約(フェイルクローズ: 本番で誤って in-memory に落ちない)。
// 単一インスタンスを使い回す(in-memory の状態一貫性のため)。
// =============================================================================

import type { Repo } from "./types";
import { MemoryRepo } from "./memory";
import { PrismaRepo } from "./prisma-repo";
import { isMockDbEnabled } from "@/lib/env";

export * from "./types";

let _repo: Repo | null = null;

export function getRepo(): Repo {
  if (_repo) return _repo;
  const useMemory = isMockDbEnabled(); // 本番は常に false(=Prisma)
  // PrismaRepo は import しても DB 接続を開かない(Prisma Client は遅延接続)。
  // 実 DB を叩くのは MOCK_DB=0 でメソッドが呼ばれたときのみ。S1 既定は MemoryRepo。
  _repo = useMemory ? new MemoryRepo() : new PrismaRepo();
  return _repo;
}
