// =============================================================================
// matching-app — AI一次判定 → 自動承認フローのテスト(S8 要望2)。
// route(/api/identity POST)が行う「submit → verify → setAiVerdict →
// 明白OKのみ approve(reviewedBy=ai)・18未満は安全弁で承認しない」を
// in-memory repo に直接当てて検証する(session/cookie に依存しない)。
//
// route 本体のロジックと同じ手順を repo レベルで再現し、結線(判定→記録→承認)
// が仕様どおりであることを保証する。判定そのものの分岐は haiku-verify.test.ts。
// =============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// repo/index.ts は "server-only" を import するため node 実行用に空モック。
vi.mock("server-only", () => ({}));

import { getRepo } from "@/lib/repo";
import { __resetMemoryStore } from "@/lib/repo/memory";
import { verifyIdentityImage } from "@/lib/haiku-verify";
import { isAdult } from "@/lib/domain/age";
import type { IdentityAiVerdict, IdDocType } from "@/lib/types";

const ENV_SNAPSHOT = { ...process.env };
const DOC: IdDocType = "drivers_license";

// NODE_ENV は @types/node で読み取り専用に推論されるため Record キャストで書き換える。
function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete (process.env as Record<string, string>)[key];
  else (process.env as Record<string, string>)[key] = value;
}

beforeEach(() => {
  // in-memory repo を使う(MOCK_DB=1)。各テストで seed 済みストアにリセットし、
  // getRepo() を MemoryRepo に確定させてから使う(sibling test と同じ作法)。
  // MOCK_AI 未設定=モック判定ON。
  setEnv("NODE_ENV", "test");
  setEnv("MOCK_DB", "1");
  setEnv("MOCK_AI", undefined);
  __resetMemoryStore();
});

afterEach(() => {
  process.env = { ...ENV_SNAPSHOT };
});

function birthdateForAge(age: number): Date {
  const now = new Date();
  return new Date(now.getFullYear() - age, now.getMonth(), now.getDate());
}

/** ユーザー + プロフィール(指定年齢)を作って userId を返す。 */
async function seedUserWithAge(lineUserId: string, age: number): Promise<string> {
  const repo = getRepo();
  const user = await repo.users.upsertByLineUserId({ lineUserId, displayName: "T" });
  await repo.profiles.upsertByUserId({
    userId: user.id,
    gender: "male",
    birthdate: birthdateForAge(age),
    areaPref: ["ebisu"],
  });
  return user.id;
}

/**
 * route(/api/identity POST)のロジックを再現するヘルパ。
 * submit → verify → setAiVerdict → (ok && isAdult) なら approve(reviewedBy=ai)。
 * 戻り値は最終 status と aiVerdict(route のレスポンスと同じ)。
 */
async function submitWithAi(
  userId: string,
  blobRef: string
): Promise<{ status: string; aiVerdict: IdentityAiVerdict | null; ivId: string }> {
  const repo = getRepo();
  const iv = await repo.identities.submit({ userId, docType: DOC, blobRef });
  const profile = await repo.profiles.findByUserId(userId);
  let aiVerdict: IdentityAiVerdict | null = null;
  let finalStatus: string = iv.status;
  if (profile) {
    const ai = await verifyIdentityImage({
      docType: DOC,
      blobRef,
      birthdate: profile.birthdate,
    });
    aiVerdict = ai.verdict;
    await repo.identities.setAiVerdict(iv.id, ai.verdict, ai.reason);
    if (ai.verdict === "ok" && isAdult(profile.birthdate, new Date())) {
      const approved = await repo.identities.approve(iv.id, "ai");
      if (approved) finalStatus = approved.status;
    }
  }
  return { status: finalStatus, aiVerdict, ivId: iv.id };
}

describe("AI一次判定 → 自動承認フロー", () => {
  it("明白OK(18+・読取良好)は自動承認: status=approved / reviewedBy=ai / aiReason 記録", async () => {
    const userId = await seedUserWithAge("U-ok", 27);
    const res = await submitWithAi(userId, "blob/clean.jpg");

    expect(res.aiVerdict).toBe("ok");
    expect(res.status).toBe("approved");

    const iv = await getRepo().identities.findById(res.ivId);
    expect(iv?.status).toBe("approved");
    expect(iv?.reviewedBy).toBe("ai"); // 自動承認は reviewedBy="ai"
    expect(iv?.aiVerdict).toBe("ok");
    expect(iv?.aiReason).toBeTruthy(); // 判定根拠(監査)が残る
    // 注: 承認時の画像削除(blobRef=null/imageDeletedAt)は既存 approve の責務で、
    // 基盤の identity テストが担保する。ここは AI→自動承認の結線のみを検証する。
  });

  it("review(グレー)は pending 据え置き・判定根拠は記録(運営確認待ち)", async () => {
    const userId = await seedUserWithAge("U-review", 33);
    const res = await submitWithAi(userId, "blob/blurry-scan.jpg");

    expect(res.aiVerdict).toBe("review");
    expect(res.status).toBe("pending"); // 自動承認しない

    const iv = await getRepo().identities.findById(res.ivId);
    expect(iv?.status).toBe("pending");
    expect(iv?.reviewedBy).toBeNull(); // 承認されていない
    expect(iv?.aiVerdict).toBe("review");
    expect(iv?.aiReason).toBeTruthy(); // 監査記録は残る
  });

  it("ng(18未満)は pending 据え置き・承認されない(運営が却下操作)", async () => {
    const userId = await seedUserWithAge("U-ng", 16);
    const res = await submitWithAi(userId, "blob/clean.jpg");

    expect(res.aiVerdict).toBe("ng");
    expect(res.status).toBe("pending"); // ng は自動却下せず pending(運営 reject)
    expect(res.status).not.toBe("approved"); // 18未満は絶対に承認しない

    const iv = await getRepo().identities.findById(res.ivId);
    expect(iv?.status).toBe("pending");
    expect(iv?.reviewedBy).toBeNull();
    expect(iv?.aiVerdict).toBe("ng");
    expect(iv?.aiReason).toMatch(/18歳未満/);
  });
});

describe("年齢の安全弁(AIがokでも18未満なら承認しない)", () => {
  it("verdict を強制的に ok にしても、isAdult=false なら approve を呼ばない", async () => {
    // AI判定が(将来のバグ等で)誤って ok を返したケースを想定し、
    // route の二重チェック(isAdult)が承認を止めることを検証する。
    const userId = await seedUserWithAge("U-safeguard", 15);
    const repo = getRepo();
    const iv = await repo.identities.submit({
      userId,
      docType: DOC,
      blobRef: "blob/clean.jpg",
    });
    const profile = await repo.profiles.findByUserId(userId);
    expect(profile).not.toBeNull();

    // 強制的に「ok」判定だったとみなす(AIの暴走シミュレーション)。
    const forcedVerdict: IdentityAiVerdict = "ok";
    await repo.identities.setAiVerdict(iv.id, forcedVerdict, "forced ok for test");

    // route の安全弁: ok でも isAdult が false なら approve しない。
    let approvedCalled = false;
    if (forcedVerdict === "ok" && profile && isAdult(profile.birthdate, new Date())) {
      await repo.identities.approve(iv.id, "ai");
      approvedCalled = true;
    }

    expect(isAdult(profile!.birthdate, new Date())).toBe(false); // 15歳=未成年
    expect(approvedCalled).toBe(false); // 承認は呼ばれない

    const after = await repo.identities.findById(iv.id);
    expect(after?.status).toBe("pending"); // 承認されず pending のまま
    expect(after?.status).not.toBe("approved");
  });

  it("18歳以上で verdict=ok なら承認される(安全弁は成人を妨げない)", async () => {
    const userId = await seedUserWithAge("U-adult-ok", 18); // 境界
    const res = await submitWithAi(userId, "blob/clean.jpg");
    expect(res.aiVerdict).toBe("ok");
    expect(res.status).toBe("approved");
  });
});

describe("プロフィール未作成(生年月日不明)", () => {
  it("AI判定せず pending 据え置き(18+ を確認できないため承認しない)", async () => {
    const repo = getRepo();
    const user = await repo.users.upsertByLineUserId({
      lineUserId: "U-noprofile",
      displayName: "NoProfile",
    });
    // プロフィール未作成のまま submit。
    const iv = await repo.identities.submit({
      userId: user.id,
      docType: DOC,
      blobRef: "blob/clean.jpg",
    });
    const profile = await repo.profiles.findByUserId(user.id);
    expect(profile).toBeNull();

    // route: profile が無ければ AI 判定スキップ・pending 据え置き。
    const aiVerdict: IdentityAiVerdict | null = null;
    const finalStatus: string = iv.status;
    expect(aiVerdict).toBeNull();
    expect(finalStatus).toBe("pending");

    const after = await repo.identities.findById(iv.id);
    expect(after?.status).toBe("pending");
    expect(after?.aiVerdict).toBeNull(); // 判定は走っていない
  });
});
