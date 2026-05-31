// =============================================================================
// matching-app — identity-ai.ts（トリガー駆動の AI 判定「適用」）テスト。
//
// applyAiVerdict は、トリガージョブが書き戻した判定をサーバ側で適用する関数:
//   - setAiVerdict で監査記録
//   - ok かつ 18歳以上 のときだけ自動承認（安全弁: AIがokでも18未満は承認しない）
//   - review / ng は pending 据え置き
//   - 既に承認済/却下済なら状態を動かさず冪等
// in-memory repo に直接当てて検証する（session/cookie 非依存）。
// =============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// repo/index.ts などが "server-only" を import するため node 実行用に空モック。
vi.mock("server-only", () => ({}));

import { getRepo } from "@/lib/repo";
import { __resetMemoryStore } from "@/lib/repo/memory";
import { applyAiVerdict } from "@/lib/identity-ai";
import type { IdDocType } from "@/lib/types";

const ENV_SNAPSHOT = { ...process.env };
const DOC: IdDocType = "drivers_license";

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete (process.env as Record<string, string>)[key];
  else (process.env as Record<string, string>)[key] = value;
}

beforeEach(() => {
  setEnv("NODE_ENV", "test");
  setEnv("MOCK_DB", "1");
  __resetMemoryStore();
});

afterEach(() => {
  process.env = { ...ENV_SNAPSHOT };
});

function birthdateForAge(age: number): Date {
  const now = new Date();
  return new Date(now.getFullYear() - age, now.getMonth(), now.getDate());
}

/** ユーザー+プロフィール(年齢指定)+pending な identity を作り、identity id を返す。 */
async function seedPendingIdentity(
  lineUserId: string,
  age: number,
  opts?: { noProfile?: boolean }
): Promise<string> {
  const repo = getRepo();
  const user = await repo.users.upsertByLineUserId({ lineUserId, displayName: "T" });
  if (!opts?.noProfile) {
    await repo.profiles.upsertByUserId({
      userId: user.id,
      gender: "male",
      birthdate: birthdateForAge(age),
      areaPref: ["ebisu"],
    });
  }
  const iv = await repo.identities.submit({
    userId: user.id,
    docType: DOC,
    blobRef: "blob/clean.jpg",
  });
  return iv.id;
}

describe("applyAiVerdict — トリガーが書き戻した判定の適用", () => {
  it("ok かつ 18歳以上 → 自動承認(status=approved / autoApproved=true / reviewedBy=ai)", async () => {
    const id = await seedPendingIdentity("U-ok-adult", 27);
    const res = await applyAiVerdict(id, "ok", "AI(trigger): 18歳以上・読取良好。");

    expect(res.ok).toBe(true);
    expect(res.status).toBe("approved");
    expect(res.autoApproved).toBe(true);

    const iv = await getRepo().identities.findById(id);
    expect(iv?.status).toBe("approved");
    expect(iv?.reviewedBy).toBe("ai");
    expect(iv?.aiVerdict).toBe("ok");
    expect(iv?.aiReason).toBeTruthy(); // 監査記録が残る
  });

  it("安全弁: ok でも 18歳未満 → 承認しない(status=pending / autoApproved=false)", async () => {
    const id = await seedPendingIdentity("U-ok-minor", 15);
    const res = await applyAiVerdict(id, "ok", "AI(trigger): 誤って ok を返したケース。");

    expect(res.ok).toBe(true);
    expect(res.status).toBe("pending"); // 18未満は絶対に承認しない
    expect(res.autoApproved).toBe(false);

    const iv = await getRepo().identities.findById(id);
    expect(iv?.status).toBe("pending");
    expect(iv?.reviewedBy).toBeNull();
    expect(iv?.aiVerdict).toBe("ok"); // 判定自体は記録される（監査）
  });

  it("review → pending 据え置き・判定は記録(運営確認待ち)", async () => {
    const id = await seedPendingIdentity("U-review", 33);
    const res = await applyAiVerdict(id, "review", "AI(trigger): 不鮮明のため要確認。");

    expect(res.ok).toBe(true);
    expect(res.status).toBe("pending");
    expect(res.autoApproved).toBe(false);

    const iv = await getRepo().identities.findById(id);
    expect(iv?.status).toBe("pending");
    expect(iv?.aiVerdict).toBe("review");
    expect(iv?.aiReason).toBeTruthy();
  });

  it("ng → pending 据え置き・承認しない(運営が reject 操作)", async () => {
    const id = await seedPendingIdentity("U-ng", 16);
    const res = await applyAiVerdict(id, "ng", "AI(trigger): 18歳未満のため不可。");

    expect(res.ok).toBe(true);
    expect(res.status).toBe("pending");
    expect(res.autoApproved).toBe(false);

    const iv = await getRepo().identities.findById(id);
    expect(iv?.aiVerdict).toBe("ng");
  });

  it("プロフィール未作成（生年月日不明）→ ok でも承認しない(18+確認不能)", async () => {
    const id = await seedPendingIdentity("U-noprofile", 30, { noProfile: true });
    const res = await applyAiVerdict(id, "ok", "AI(trigger): プロフィール無し。");

    expect(res.ok).toBe(true);
    expect(res.status).toBe("pending");
    expect(res.autoApproved).toBe(false);
  });

  it("存在しない id → ok:false / code=not_found", async () => {
    const res = await applyAiVerdict("does-not-exist", "ok", "x");
    expect(res.ok).toBe(false);
    expect(res.code).toBe("not_found");
  });

  it("冪等: 既に approved な identity に再適用しても autoApproved=false・状態維持", async () => {
    const id = await seedPendingIdentity("U-idem", 27);
    const first = await applyAiVerdict(id, "ok", "1回目");
    expect(first.autoApproved).toBe(true);
    expect(first.status).toBe("approved");

    // 2回目（トリガーが再送した等）。既に approved なので承認は繰り返さない。
    const second = await applyAiVerdict(id, "ok", "2回目(再送)");
    expect(second.ok).toBe(true);
    expect(second.status).toBe("approved");
    expect(second.autoApproved).toBe(false);

    const iv = await getRepo().identities.findById(id);
    expect(iv?.status).toBe("approved");
  });
});
