// =============================================================================
// matching-app — S4 payment-service の結合テスト（in-memory repo・Stripeモック）
// computeFee の純ロジックは payment.test.ts で網羅。ここでは service が
// repo/stripe-mock を正しく束ね、ビジネスルール（女性/初回非課金・2回目課金・
// 不成立非課金・IDOR）を満たすことを検証する。
//
// server-only を import する payment-service / payment-repo を vitest(node) で
// 読むため "server-only" をモックする（feedback_vitest-route-testing の作法）。
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createIntentForSlot,
  confirmPayment,
  listMyPayments,
} from "@/lib/payment-service";
import { getRepo } from "@/lib/repo";
import { __resetPaymentStore } from "@/lib/repo/payment-repo";

// 既存 in-memory repo の seed を使う。seed には:
//  - seed-user-male（男性・approved）/ seed-user-female（女性）
//  - seed-slot-matched（filled・Match pending）に seed-m1..m3 / seed-f1..f3 が accepted
//  - seed-slot-normal（open・条件なし）
// が含まれる（src/lib/repo/memory.ts）。
//
// テスト方針: applyAtomic を使って「初回(past0)」「2回目(past1)」状況を作る。
//  - 男性初回: 過去 accepted 0 の男性が open 枠に応募 → intent 非課金(male_first_free)。
//  - 男性2回目: 既に accepted 枠を1つ持つ男性が別 open 枠に応募 → intent 課金(male_paid)。
//  - 女性: 女性が応募 → 常に非課金(female_free)。

beforeEach(() => {
  __resetPaymentStore();
});

/** open 枠を作って指定ユーザーを応募(applied)させ、その枠IDを返す。 */
async function applyToFreshSlot(userId: string, gender: "male" | "female"): Promise<string> {
  const repo = getRepo();
  const slot = await repo.slots.create({
    datetimeStart: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    area: "ebisu",
    feeMale: 2000,
  });
  const r = await repo.applications.applyAtomic(
    { slotId: slot.id, userId, gender },
    3
  );
  expect(r.error).toBeNull();
  return slot.id;
}

describe("createIntentForSlot — ビジネスルール", () => {
  it("女性 → 常に非課金 (female_free, amount=0, clientSecret=null)", async () => {
    const slotId = await applyToFreshSlot("seed-user-female", "female");
    const { error, response } = await createIntentForSlot("seed-user-female", slotId);
    expect(error).toBeNull();
    expect(response!.quote.chargeable).toBe(false);
    expect(response!.quote.reason).toBe("female_free");
    expect(response!.quote.amountJpy).toBe(0);
    expect(response!.clientSecret).toBeNull();
    expect(response!.payment.status).toBe("succeeded");
    expect(response!.payment.amountJpy).toBe(0);
  });

  it("女性 冪等再呼び出し → reason は female_free のまま（male_paid に化けない・回帰）", async () => {
    // 既存決済の再利用ブランチが isFirstFree からのみ reason を推測すると、
    // 女性の非課金記録(isFirstFree=false)を "male_paid" と誤ラベルする回帰があった。
    const slotId = await applyToFreshSlot("seed-user-female", "female");
    await createIntentForSlot("seed-user-female", slotId); // 1回目（succeeded を作る）
    const { error, response } = await createIntentForSlot("seed-user-female", slotId); // 2回目=冪等
    expect(error).toBeNull();
    expect(response!.quote.reason).toBe("female_free"); // ← male_paid であってはならない
    expect(response!.quote.chargeable).toBe(false);
    expect(response!.quote.amountJpy).toBe(0);
  });

  it("男性 初回（過去 accepted 0）→ 非課金 (male_first_free)", async () => {
    const slotId = await applyToFreshSlot("seed-user-male", "male");
    const { error, response } = await createIntentForSlot("seed-user-male", slotId);
    expect(error).toBeNull();
    expect(response!.quote.chargeable).toBe(false);
    expect(response!.quote.reason).toBe("male_first_free");
    expect(response!.clientSecret).toBeNull();
    expect(response!.payment.isFirstFree).toBe(true);
    expect(response!.payment.status).toBe("succeeded");
  });

  it("男性 2回目（過去 accepted 1）→ 課金 ¥2000 (male_paid, requires_capture, client_secret あり)", async () => {
    // seed-m1 は seed-slot-matched で accepted 済み（過去 accepted 1）。
    const slotId = await applyToFreshSlot("seed-m1", "male");
    const { error, response } = await createIntentForSlot("seed-m1", slotId);
    expect(error).toBeNull();
    expect(response!.quote.chargeable).toBe(true);
    expect(response!.quote.reason).toBe("male_paid");
    expect(response!.quote.amountJpy).toBe(2000);
    expect(response!.clientSecret).toMatch(/^pi_mock_.*_secret_/);
    expect(response!.payment.status).toBe("requires_capture"); // 不成立では課金しない（与信のみ）。
    expect(response!.payment.amountJpy).toBe(2000);
  });

  it("非参加者 → not_participant（IDOR: 自分の枠でない）", async () => {
    const slotId = await applyToFreshSlot("seed-user-male", "male");
    // seed-user-female はこの枠に応募していない。
    const { error, response } = await createIntentForSlot("seed-user-female", slotId);
    expect(error).toBe("not_participant");
    expect(response).toBeNull();
  });

  it("存在しない枠 → slot_not_found", async () => {
    const { error } = await createIntentForSlot("seed-user-male", "no-such-slot");
    expect(error).toBe("slot_not_found");
  });

  it("冪等: 同一枠で2回 intent → 2件目も同じ payment（二重課金しない）", async () => {
    const slotId = await applyToFreshSlot("seed-m1", "male");
    const first = await createIntentForSlot("seed-m1", slotId);
    const second = await createIntentForSlot("seed-m1", slotId);
    expect(first.response!.payment.id).toBe(second.response!.payment.id);
    const mine = await listMyPayments("seed-m1");
    const forSlot = mine.filter((p) => p.slotId === slotId);
    expect(forSlot.length).toBe(1);
  });
});

describe("confirmPayment — 確定課金 / IDOR", () => {
  it("男性2回目の与信 → confirm で succeeded（capture 相当）", async () => {
    const slotId = await applyToFreshSlot("seed-m2", "male");
    const intent = await createIntentForSlot("seed-m2", slotId);
    const paymentId = intent.response!.payment.id;
    const { error, payment } = await confirmPayment("seed-m2", paymentId);
    expect(error).toBeNull();
    expect(payment!.status).toBe("succeeded");
    expect(payment!.paidAt).not.toBeNull();
  });

  it("他人の Payment を confirm → forbidden（IDOR防止）", async () => {
    const slotId = await applyToFreshSlot("seed-m2", "male");
    const intent = await createIntentForSlot("seed-m2", slotId);
    const paymentId = intent.response!.payment.id;
    // 別ユーザー(seed-m3)が他人の paymentId を confirm 試行。
    const { error, payment } = await confirmPayment("seed-m3", paymentId);
    expect(error).toBe("forbidden");
    expect(payment).toBeNull();
  });

  it("存在しない paymentId → not_found", async () => {
    const { error } = await confirmPayment("seed-m2", "no-such-payment");
    expect(error).toBe("not_found");
  });

  it("confirm は冪等（succeeded を再 confirm しても succeeded）", async () => {
    const slotId = await applyToFreshSlot("seed-m2", "male");
    const intent = await createIntentForSlot("seed-m2", slotId);
    const paymentId = intent.response!.payment.id;
    await confirmPayment("seed-m2", paymentId);
    const again = await confirmPayment("seed-m2", paymentId);
    expect(again.error).toBeNull();
    expect(again.payment!.status).toBe("succeeded");
  });
});
