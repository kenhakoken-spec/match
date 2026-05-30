// =============================================================================
// matching-app — S8 chargeNoShowPenalty 単体テスト（payment-service の no-show 追加）。
// 罰金額・冪等・種別(no_show_penalty)・Stripe(モック)突合を検証。
// 既存 payment-service.test.ts（参加費フロー）とは独立（S8 追加分のみ）。
//
// server-only を import する payment-service を vitest(node) で読むためモックする。
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { chargeNoShowPenalty } from "@/lib/payment-service";
import { __resetPaymentStore, getPaymentRepo } from "@/lib/repo/payment-repo";
import { penaltyAmountJpy } from "@/lib/domain/payment";

beforeEach(() => {
  __resetPaymentStore();
});

describe("chargeNoShowPenalty — 課金", () => {
  it("¥5,000・type=no_show_penalty・succeeded・Stripe intent 付きで作成", async () => {
    const res = await chargeNoShowPenalty("u_ratee", "slot_x");
    expect(res.charged).toBe(true);
    expect(res.payment).not.toBeNull();
    const p = res.payment!;
    expect(p.amount).toBe(penaltyAmountJpy());
    expect(p.amount).toBe(5000);
    expect(p.type).toBe("no_show_penalty");
    expect(p.status).toBe("succeeded");
    expect(p.userId).toBe("u_ratee");
    expect(p.slotId).toBe("slot_x");
    expect(p.isFirstFree).toBe(false);
    // Stripe(モック)の PaymentIntent と突合できる id を持つ。
    expect(p.stripePaymentIntentId).toMatch(/^pi_mock_/);
    // paidAt が打刻されている（succeeded）。
    expect(p.paidAt).not.toBeNull();
  });
});

describe("chargeNoShowPenalty — 冪等（二重課金防止）", () => {
  it("同一(slot, ratee)で2回呼んでも罰金は1件のみ・2回目は charged=false", async () => {
    const first = await chargeNoShowPenalty("u_ratee", "slot_x");
    const second = await chargeNoShowPenalty("u_ratee", "slot_x");
    expect(first.charged).toBe(true);
    expect(second.charged).toBe(false);
    expect(second.payment!.id).toBe(first.payment!.id);

    const mine = await getPaymentRepo().listByUser("u_ratee");
    const penalties = mine.filter((p) => p.type === "no_show_penalty");
    expect(penalties.length).toBe(1);
  });

  it("参加費(participation)が同一枠にあっても no-show 罰金は別途1件作る", async () => {
    // 同一(slot, user) に参加費を先に作る（schema は @@unique だが in-memory は型で区別）。
    await getPaymentRepo().create({
      userId: "u_ratee",
      slotId: "slot_x",
      amount: 2000,
      isFirstFree: false,
      type: "participation",
      status: "succeeded",
    });
    const res = await chargeNoShowPenalty("u_ratee", "slot_x");
    expect(res.charged).toBe(true);
    expect(res.payment!.type).toBe("no_show_penalty");

    const mine = await getPaymentRepo().listByUser("u_ratee");
    expect(mine.filter((p) => p.type === "participation").length).toBe(1);
    expect(mine.filter((p) => p.type === "no_show_penalty").length).toBe(1);
  });

  it("別 ratee は別々に課金される（冪等は (slot,ratee) 単位）", async () => {
    await chargeNoShowPenalty("u_a", "slot_x");
    await chargeNoShowPenalty("u_b", "slot_x");
    const a = await getPaymentRepo().findBySlotUserAndType(
      "slot_x",
      "u_a",
      "no_show_penalty"
    );
    const b = await getPaymentRepo().findBySlotUserAndType(
      "slot_x",
      "u_b",
      "no_show_penalty"
    );
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.id).not.toBe(b!.id);
  });
});
