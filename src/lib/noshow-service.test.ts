// =============================================================================
// matching-app — S8 no-show サービス 結合テスト（in-memory repo・Stripeモック）。
// 確定の数値判定は domain/noshow.test.ts で網羅。ここでは service が
// rating-repo / payment-service / profiles を正しく束ね、spec 要望5 を満たすことを検証:
//   - 1人の報告では確定しない（罰金なし・noShowCount 据え置き）。
//   - 2人以上の報告で確定 → ¥5,000 課金 + noShowCount++。
//   - 冪等: 確定後に3人目が報告しても二重課金/二重カウントしない。
//   - 自己申告は集計から除外。非参加者の報告は集計しない。
//
// server-only を import する payment-service / repo を vitest(node) で読むため
// "server-only" をモックする（feedback_vitest-route-testing の作法）。
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { evaluateNoShowForRatee } from "@/lib/noshow-service";
import { getRepo } from "@/lib/repo";
import { __resetMemoryStore } from "@/lib/repo/memory";
import { getRatingRepo, seedDoneEventForTest } from "@/lib/repo/rating-repo";
import { __resetPaymentStore, getPaymentRepo } from "@/lib/repo/payment-repo";

// no-show 報告を1件 直接 Rating に保存するヘルパ（評価ゲートは別途 rating-service で検証）。
// raterId が ratee を「来なかった」と報告する 3軸評価（スコアは確定判定に無関係）。
async function reportNoShow(
  slotId: string,
  raterId: string,
  rateeId: string
): Promise<void> {
  await getRatingRepo().recordRating({
    slotId,
    raterId,
    rateeId,
    score: 1,
    scoreAgain: 1,
    scoreTalk: 1,
    scoreManner: 1,
    noShowReport: true,
    comment: null,
  });
}

let SLOT = "";
let MEMBERS: string[] = [];

beforeEach(() => {
  // 完全な per-test 分離: 共有ストア(__mappStore)を作り直す（前テストの
  // incrementNoShow 等のプロフィール変更・applications を引き継がない）。
  // その後 Rating/Payment 専用ストアも初期化する。
  __resetMemoryStore();
  const g = globalThis as unknown as {
    __mappRatingStore?: { ratings: Map<string, unknown> };
  };
  g.__mappRatingStore = { ratings: new Map() };
  __resetPaymentStore();
  // done 済イベント + 6名 accepted（rate-m1..m3 / rate-f1..f3）を用意。
  // 共有ストアを作り直した直後なので done slot は未存在 → 毎回 fresh に再 seed される。
  const seeded = seedDoneEventForTest();
  SLOT = seeded.doneSlotId;
  MEMBERS = seeded.memberIds;
});

describe("evaluateNoShowForRatee — 確定しきい値(2人以上)", () => {
  it("報告0件 → 未確定・課金なし・noShowCount 据え置き", async () => {
    const target = MEMBERS[0];
    const res = await evaluateNoShowForRatee(SLOT, target);
    expect(res.reportCount).toBe(0);
    expect(res.confirmed).toBe(false);
    expect(res.charged).toBe(false);
    expect(res.incremented).toBe(false);
    const prof = await getRepo().profiles.findByUserId(target);
    expect(prof!.noShowCount).toBe(0);
  });

  it("報告1件 → 未確定（誤報防止）・課金なし", async () => {
    const target = MEMBERS[0];
    await reportNoShow(SLOT, MEMBERS[1], target);
    const res = await evaluateNoShowForRatee(SLOT, target);
    expect(res.reportCount).toBe(1);
    expect(res.confirmed).toBe(false);
    expect(res.charged).toBe(false);
    const prof = await getRepo().profiles.findByUserId(target);
    expect(prof!.noShowCount).toBe(0);
    // 罰金 Payment も作られていない。
    const pay = await getPaymentRepo().findBySlotUserAndType(
      SLOT,
      target,
      "no_show_penalty"
    );
    expect(pay).toBeNull();
  });

  it("報告2件 → 確定 → ¥5,000 課金 + noShowCount=1", async () => {
    const target = MEMBERS[0];
    await reportNoShow(SLOT, MEMBERS[1], target);
    await reportNoShow(SLOT, MEMBERS[2], target);
    const res = await evaluateNoShowForRatee(SLOT, target);
    expect(res.reportCount).toBe(2);
    expect(res.confirmed).toBe(true);
    expect(res.charged).toBe(true);
    expect(res.incremented).toBe(true);

    const prof = await getRepo().profiles.findByUserId(target);
    expect(prof!.noShowCount).toBe(1);

    const pay = await getPaymentRepo().findBySlotUserAndType(
      SLOT,
      target,
      "no_show_penalty"
    );
    expect(pay).not.toBeNull();
    expect(pay!.amount).toBe(5000);
    expect(pay!.type).toBe("no_show_penalty");
    expect(pay!.status).toBe("succeeded");
    expect(pay!.userId).toBe(target);
  });
});

describe("evaluateNoShowForRatee — 冪等（二重課金/二重カウント防止）", () => {
  it("確定後に再評価しても二重課金/二重カウントしない", async () => {
    const target = MEMBERS[0];
    await reportNoShow(SLOT, MEMBERS[1], target);
    await reportNoShow(SLOT, MEMBERS[2], target);
    const first = await evaluateNoShowForRatee(SLOT, target);
    expect(first.charged).toBe(true);

    // 3人目が報告 → 再評価。確定のままだが新規課金/カウントはしない。
    await reportNoShow(SLOT, MEMBERS[3], target);
    const second = await evaluateNoShowForRatee(SLOT, target);
    expect(second.confirmed).toBe(true);
    expect(second.reportCount).toBe(3);
    expect(second.charged).toBe(false); // 冪等
    expect(second.incremented).toBe(false); // 冪等

    const prof = await getRepo().profiles.findByUserId(target);
    expect(prof!.noShowCount).toBe(1); // 1のまま

    // 罰金 Payment は1件だけ。
    const mine = await getPaymentRepo().listByUser(target);
    const penalties = mine.filter((p) => p.type === "no_show_penalty");
    expect(penalties.length).toBe(1);
  });
});

describe("evaluateNoShowForRatee — 集計の限定（自己申告除外 / 参加者のみ）", () => {
  it("自己申告（rater===ratee）は集計に数えない", async () => {
    const target = MEMBERS[0];
    // 本人が自分を「来なかった」と報告（除外されるべき）。
    await reportNoShow(SLOT, target, target);
    await reportNoShow(SLOT, MEMBERS[1], target);
    const res = await evaluateNoShowForRatee(SLOT, target);
    // 有効報告は MEMBERS[1] の1件のみ → 未確定。
    expect(res.reportCount).toBe(1);
    expect(res.confirmed).toBe(false);
    expect(res.charged).toBe(false);
  });

  it("非参加者の報告は集計しない（participant のみ）", async () => {
    const target = MEMBERS[0];
    // 参加者2名 + 外部の非参加者1名が報告。非参加者は除外され有効2件で確定。
    await reportNoShow(SLOT, MEMBERS[1], target);
    await reportNoShow(SLOT, MEMBERS[2], target);
    await reportNoShow(SLOT, "rate-outsider", target);
    const res = await evaluateNoShowForRatee(SLOT, target);
    expect(res.reportCount).toBe(2); // outsider は数えない
    expect(res.confirmed).toBe(true);
  });

  it("非参加者の報告だけでは確定しない（有効報告0）", async () => {
    const target = MEMBERS[0];
    await reportNoShow(SLOT, "rate-outsider", target);
    const res = await evaluateNoShowForRatee(SLOT, target);
    expect(res.reportCount).toBe(0);
    expect(res.confirmed).toBe(false);
  });
});
