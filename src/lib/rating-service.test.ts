// =============================================================================
// matching-app — S8 rating-service 結合テスト（3軸評価 + no-show 結線）。
// canRate の純判定は domain/rating.test.ts、確定判定は domain/noshow.test.ts、
// 課金は payment-noshow.test.ts で網羅。ここでは submitRating が:
//   - 3軸を保存し、後方互換 score に総合(overall)の丸めを入れる。
//   - 被評価者 Profile の多軸集計(scoreAgainAvg.. / ratingAvg=overall)を更新する。
//   - canRate を再判定して self/非参加者/非同席者/二重を拒否する。
//   - noShowReport を含む評価で no-show 確定→課金まで結線する。
// を検証する。
//
// rating-service は badge-service / noshow-service 経由で server-only を読むためモック。
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { submitRating, getReceivedSummary } from "@/lib/rating-service";
import { getRepo } from "@/lib/repo";
import { __resetMemoryStore } from "@/lib/repo/memory";
import { seedDoneEventForTest } from "@/lib/repo/rating-repo";
import { __resetPaymentStore, getPaymentRepo } from "@/lib/repo/payment-repo";

let SLOT = "";
let MEMBERS: string[] = [];
let OUTSIDER = "";

beforeEach(() => {
  // 完全な per-test 分離: 共有ストアを作り直してから専用ストアを初期化する
  // （前テストの Profile 集計・no-show カウント・評価を引き継がない）。
  __resetMemoryStore();
  const g = globalThis as unknown as {
    __mappRatingStore?: { ratings: Map<string, unknown> };
  };
  g.__mappRatingStore = { ratings: new Map() };
  __resetPaymentStore();
  const seeded = seedDoneEventForTest();
  SLOT = seeded.doneSlotId;
  MEMBERS = seeded.memberIds; // rate-m1..m3, rate-f1..f3（全員 accepted・done）
  OUTSIDER = seeded.outsiderId;
});

describe("submitRating — 3軸保存と集計反映", () => {
  it("3軸を保存し、後方互換 score=round(overall)・multiAxis を返す", async () => {
    // again5 talk3 manner4 → overall=(5+3+4)/3=4 → score=4
    const res = await submitRating({
      raterUserId: MEMBERS[0],
      slotId: SLOT,
      rateeId: MEMBERS[1],
      scoreAgain: 5,
      scoreTalk: 3,
      scoreManner: 4,
      comment: "楽しかった",
    });
    expect(res.ok).toBe(true);
    expect(res.rating!.score).toBe(4);
    expect(res.multiAxis).toEqual({
      again: 5,
      talk: 3,
      manner: 4,
      overall: 4,
      count: 1,
    });
    // 被評価者 Profile に多軸集計が反映される（overall→ratingAvg、軸別→scoreXxxAvg）。
    const prof = await getRepo().profiles.findByUserId(MEMBERS[1]);
    expect(prof!.ratingAvg).toBe(4);
    expect(prof!.scoreAgainAvg).toBe(5);
    expect(prof!.scoreTalkAvg).toBe(3);
    expect(prof!.scoreMannerAvg).toBe(4);
    expect(prof!.ratingCount).toBe(1);
  });

  it("複数評価者の多軸平均が集計される", async () => {
    // ratee=MEMBERS[1] に 2名が評価。
    await submitRating({
      raterUserId: MEMBERS[0],
      slotId: SLOT,
      rateeId: MEMBERS[1],
      scoreAgain: 5,
      scoreTalk: 4,
      scoreManner: 5,
    });
    await submitRating({
      raterUserId: MEMBERS[2],
      slotId: SLOT,
      rateeId: MEMBERS[1],
      scoreAgain: 3,
      scoreTalk: 2,
      scoreManner: 5,
    });
    // again:(5+3)/2=4, talk:(4+2)/2=3, manner:5, overall:(5+4+5+3+2+5)/6=4
    const summary = await getReceivedSummary(MEMBERS[1]);
    expect(summary).toEqual({
      again: 4,
      talk: 3,
      manner: 5,
      overall: 4,
      count: 2,
      avg: 4, // 後方互換（=overall）
    });
  });
});

describe("submitRating — canRate 再判定（IDOR/不正の拒否）", () => {
  it("自己評価は self_rate で拒否", async () => {
    const res = await submitRating({
      raterUserId: MEMBERS[0],
      slotId: SLOT,
      rateeId: MEMBERS[0],
      scoreAgain: 5,
      scoreTalk: 5,
      scoreManner: 5,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("self_rate");
  });

  it("非参加者(rater)は not_participant で拒否", async () => {
    const res = await submitRating({
      raterUserId: OUTSIDER, // done に accepted で参加していない
      slotId: SLOT,
      rateeId: MEMBERS[0],
      scoreAgain: 5,
      scoreTalk: 5,
      scoreManner: 5,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("not_participant");
  });

  it("同席者でない相手(ratee)は not_co_member で拒否", async () => {
    const res = await submitRating({
      raterUserId: MEMBERS[0],
      slotId: SLOT,
      rateeId: OUTSIDER, // 同席者ではない
      scoreAgain: 5,
      scoreTalk: 5,
      scoreManner: 5,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("not_co_member");
  });

  it("二重評価は already_rated で拒否", async () => {
    const base = {
      raterUserId: MEMBERS[0],
      slotId: SLOT,
      rateeId: MEMBERS[1],
      scoreAgain: 4,
      scoreTalk: 4,
      scoreManner: 4,
    };
    const first = await submitRating(base);
    expect(first.ok).toBe(true);
    const second = await submitRating(base);
    expect(second.ok).toBe(false);
    expect(second.reason).toBe("already_rated");
  });

  it("範囲外スコア(0/6)は invalid_score で拒否", async () => {
    const res = await submitRating({
      raterUserId: MEMBERS[0],
      slotId: SLOT,
      rateeId: MEMBERS[1],
      scoreAgain: 0,
      scoreTalk: 5,
      scoreManner: 5,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("invalid_score");
  });
});

describe("submitRating — no-show 報告の結線", () => {
  it("1人の noShowReport では確定しない（noShow.confirmed=false・課金なし）", async () => {
    const res = await submitRating({
      raterUserId: MEMBERS[0],
      slotId: SLOT,
      rateeId: MEMBERS[5], // rate-f3 を対象にする
      scoreAgain: 1,
      scoreTalk: 1,
      scoreManner: 1,
      noShowReport: true,
    });
    expect(res.ok).toBe(true);
    expect(res.noShow).toEqual({ reported: true, confirmed: false, charged: false });
    const pay = await getPaymentRepo().findBySlotUserAndType(
      SLOT,
      MEMBERS[5],
      "no_show_penalty"
    );
    expect(pay).toBeNull();
  });

  it("2人目の noShowReport で確定 → ¥5,000 課金 + noShowCount++", async () => {
    const target = MEMBERS[5];
    await submitRating({
      raterUserId: MEMBERS[0],
      slotId: SLOT,
      rateeId: target,
      scoreAgain: 1,
      scoreTalk: 1,
      scoreManner: 1,
      noShowReport: true,
    });
    const second = await submitRating({
      raterUserId: MEMBERS[1],
      slotId: SLOT,
      rateeId: target,
      scoreAgain: 1,
      scoreTalk: 1,
      scoreManner: 1,
      noShowReport: true,
    });
    expect(second.noShow).toEqual({ reported: true, confirmed: true, charged: true });

    const prof = await getRepo().profiles.findByUserId(target);
    expect(prof!.noShowCount).toBe(1);
    const pay = await getPaymentRepo().findBySlotUserAndType(
      SLOT,
      target,
      "no_show_penalty"
    );
    expect(pay!.amount).toBe(5000);
    expect(pay!.type).toBe("no_show_penalty");
  });

  it("確定後の3人目の報告では二重課金しない（charged=false・罰金1件）", async () => {
    const target = MEMBERS[5];
    for (const rater of [MEMBERS[0], MEMBERS[1]]) {
      await submitRating({
        raterUserId: rater,
        slotId: SLOT,
        rateeId: target,
        scoreAgain: 1,
        scoreTalk: 1,
        scoreManner: 1,
        noShowReport: true,
      });
    }
    const third = await submitRating({
      raterUserId: MEMBERS[2],
      slotId: SLOT,
      rateeId: target,
      scoreAgain: 1,
      scoreTalk: 1,
      scoreManner: 1,
      noShowReport: true,
    });
    expect(third.noShow!.confirmed).toBe(true);
    expect(third.noShow!.charged).toBe(false); // 冪等

    const mine = await getPaymentRepo().listByUser(target);
    expect(mine.filter((p) => p.type === "no_show_penalty").length).toBe(1);
    const prof = await getRepo().profiles.findByUserId(target);
    expect(prof!.noShowCount).toBe(1);
  });

  it("noShowReport を付けない評価では noShow=null（確定処理を走らせない）", async () => {
    const res = await submitRating({
      raterUserId: MEMBERS[0],
      slotId: SLOT,
      rateeId: MEMBERS[1],
      scoreAgain: 4,
      scoreTalk: 4,
      scoreManner: 4,
    });
    expect(res.noShow).toBeNull();
  });
});
