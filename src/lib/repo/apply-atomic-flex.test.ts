// =============================================================================
// matching-app — applyAtomic の実経路統合テスト（S12 #10 柔軟定員）
//
// 目的: applyAtomic(repo) が「厳密3:3」ではなく **柔軟定員(合計6・各性別2〜4)** で
//   定員ゲートと成立判定を行うことを、in-memory 実経路で実証する。
//   ここが S12 #10 で壊れていた核（security-reviewer SEC-001: UIは2:4成立と表示するのに
//   サーバが2:4を受理しなかった不整合）。下記を「真の正しい挙動」として表明する:
//     - 同性別の4人目は受理される（max=4）/ 5人目は gender_full で拒否。
//     - 合計が6に達すると、まだ max 未満の性別でも合計超過で拒否。
//     - **2:4 / 4:2 / 3:3 で matched=true**（合計6 かつ 各性別∈[2,4]）。
//     - 5:1 / 6:0 は起こり得ない（手前で gender_full に弾かれる）= 偏った成立をしない。
//   in-memory 経路を検証するが、prisma-repo.applyAtomic も **同一の純関数**
//   (canAcceptGenderFlex / isFullByCountsFlex / flexCapacityFromSlot) を使うため
//   成立条件は両経路で一致する（実装が共有する純関数で担保）。
//
// NODE_ENV は読み取り専用なので触らない。getRepo() は他テストの呼び出し履歴で
// PrismaRepo を返し得る（singleton 汚染）ため、ここでは new MemoryRepo() を直接使う。
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import { MemoryRepo, __resetMemoryStore } from "./memory";
import type { Gender } from "@/lib/types";

const repo = new MemoryRepo();

// 後方互換引数(capacityPerGender)は判定に使われない=何を渡しても結果は slot の flex cap で決まる。
// それを示すため、敢えて旧来の 3 を渡す（3 を渡しても 4人目が受理されることが flex 化の証拠）。
const LEGACY_CAP_ARG = 3;

async function openFlexSlot() {
  // 既定の柔軟定員(capacityTotal=6 / minPerGender=2 / maxPerGender=4)で枠を作る。
  return repo.slots.create({ datetimeStart: new Date(), area: "ebisu" });
}

// 指定性別を1名応募させる。userId は連番で衝突回避（applyAtomic は user/profile 実在を要求しない）。
let seq = 0;
async function apply(slotId: string, gender: Gender) {
  seq += 1;
  return repo.applications.applyAtomic(
    { slotId, userId: `flex-user-${gender}-${seq}`, gender },
    LEGACY_CAP_ARG
  );
}

beforeEach(() => {
  __resetMemoryStore();
  seq = 0;
});

describe("applyAtomic 実経路 — 柔軟定員ゲート(同性別 max4・合計6)", () => {
  it("同性別の4人目は受理される（旧3:3なら4人目で拒否されていた = flex化の核）", async () => {
    const slot = await openFlexSlot();
    for (let i = 0; i < 3; i++) {
      const r = await apply(slot.id, "male");
      expect(r.error).toBeNull();
    }
    const fourth = await apply(slot.id, "male"); // 4人目(max=4)
    expect(fourth.error).toBeNull();
    expect(fourth.counts.male).toBe(4);
    expect(fourth.matched).toBe(false); // 女0なので未成立
  });

  it("同性別の5人目は gender_full で拒否（max=4 超過）", async () => {
    const slot = await openFlexSlot();
    for (let i = 0; i < 4; i++) await apply(slot.id, "male");
    const fifth = await apply(slot.id, "male");
    expect(fifth.error).toBe("gender_full");
    expect(fifth.application).toBeNull();
  });

  it("合計6に達したら、その性別が max 未満でも合計超過で拒否（5:1や6:0を作らせない）", async () => {
    // 4:2=合計6 を作る → ここで成立するので、追加の応募は slot_closed/合計超過で弾かれる。
    const slot = await openFlexSlot();
    for (let i = 0; i < 4; i++) await apply(slot.id, "male");
    await apply(slot.id, "female");
    const sixth = await apply(slot.id, "female"); // 4:2 で合計6=成立
    expect(sixth.matched).toBe(true);

    // 成立後は枠が filled=応募不可。female(2<max4)でも合計超過/締切で受理されない。
    const seventhFemale = await apply(slot.id, "female");
    expect(seventhFemale.error).not.toBeNull();
    expect(seventhFemale.application).toBeNull();
  });
});

describe("applyAtomic 実経路 — 成立判定(柔軟比率)", () => {
  // 男 m 名・女 f 名を投入し、最後の応募が返す matched を返すヘルパ。
  async function fillAndMatched(m: number, f: number): Promise<boolean> {
    const slot = await openFlexSlot();
    // 合計が6に達した瞬間が「最後の1名」。順序に依存しないよう交互ではなく
    // 「最後の1名を残して投入 → 最後の1名」で matched を観測する。
    const males: ("male")[] = Array(m).fill("male");
    const females: ("female")[] = Array(f).fill("female");
    const order: Gender[] = [...males, ...females];
    let last = order.pop() as Gender;
    for (const g of order) {
      const r = await apply(slot.id, g);
      expect(r.error).toBeNull(); // 6に達する手前は全て受理される構成のみ渡す
    }
    const r = await apply(slot.id, last);
    expect(r.error).toBeNull();
    return r.matched;
  }

  it("3:3 → 成立(matched=true)", async () => {
    expect(await fillAndMatched(3, 3)).toBe(true);
  });

  it("2:4 → 成立(matched=true)【SEC-001 で壊れていた核を必ず assert】", async () => {
    expect(await fillAndMatched(2, 4)).toBe(true);
  });

  it("4:2 → 成立(matched=true)", async () => {
    expect(await fillAndMatched(4, 2)).toBe(true);
  });

  it("成立すると Slot.status が filled になる(2:4)", async () => {
    const slot = await openFlexSlot();
    for (let i = 0; i < 2; i++) await apply(slot.id, "male");
    for (let i = 0; i < 3; i++) await apply(slot.id, "female");
    const last = await apply(slot.id, "female"); // 2:4=合計6
    expect(last.matched).toBe(true);
    const after = await repo.slots.findById(slot.id);
    expect(after?.status).toBe("filled");
  });

  it("5:1・6:0 は実経路では発生しない（4人目超過/合計超過で手前で弾かれ、偏った成立をしない）", async () => {
    // male を 4 まで入れ(max)、5人目は拒否 → male 5 は到達不能。
    const slot = await openFlexSlot();
    for (let i = 0; i < 4; i++) {
      const r = await apply(slot.id, "male");
      expect(r.error).toBeNull();
      expect(r.matched).toBe(false); // 片側だけでは成立しない
    }
    const fifthMale = await apply(slot.id, "male");
    expect(fifthMale.error).toBe("gender_full"); // 5:x に行けない
    // よって 5:1 / 6:0 という偏った成立は実経路で構造的に発生しない。
  });
});

describe("applyAtomic 実経路 — 2:4 成立時に matched=true を返し、ゲートと一貫する", () => {
  it("男2女3(=5) の状態から male を足すと 3:3 で matched=true（合計6到達の瞬間に成立）", async () => {
    const slot = await openFlexSlot();
    for (let i = 0; i < 2; i++) await apply(slot.id, "male");
    for (let i = 0; i < 3; i++) await apply(slot.id, "female");
    // ここまで 2:3=合計5・未成立。
    const beforeLast = await repo.applications.countActiveByGender(slot.id);
    expect(beforeLast).toEqual({ male: 2, female: 3 });
    const last = await apply(slot.id, "male"); // 3:3
    expect(last.error).toBeNull();
    expect(last.matched).toBe(true);
    expect(last.counts).toEqual({ male: 3, female: 3 });
  });
});
