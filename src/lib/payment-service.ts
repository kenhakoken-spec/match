// =============================================================================
// matching-app — S4 決済サービス（route ↔ domain/repo/stripe の橋渡し）
// 認証/認可・入力検証は route 側で済ませた前提。副作用のある集約をここに閉じ、
// 課金判定の純ロジックは domain/payment.ts（テスト対象）に委譲する。
// 正典: docs/backend/api-contract-s4.md §0,§3 / docs/backend/payment.md §1,§4
//
// ビジネスルール（厳守・契約§0）:
//  - 女性は常に非課金 / 男性初回は非課金 / 男性2回目以降のみ課金。
//  - 不成立時は課金しない: intent では与信(requires_capture)に留め、
//    **成立確定後にのみ** confirm（capture→succeeded）する。
//    非課金（女性/初回）は intent 時点で succeeded 相当の確定記録を作る（実課金なし）。
// =============================================================================

import "server-only";
import { computeFee, penaltyAmountJpy } from "@/lib/domain/payment";
import { getRepo } from "@/lib/repo";
import {
  getPaymentRepo,
  type PaymentEntity,
} from "@/lib/repo/payment-repo";
import {
  createPaymentIntent,
  capturePaymentIntent,
} from "@/lib/stripe-mock";
import { env } from "@/lib/env";
import type {
  FeeQuote,
  PaymentDTO,
  PaymentIntentResponse,
} from "@/lib/payment-types";

/**
 * intent 作成の結果区分（route のエラー変換用）。
 * 注: intent は「与信(requires_capture)→成立確定後に capture」方式のため、
 * intent 時点で Match の存在は要求しない（不成立では capture しない＝課金しない）。
 */
export type IntentError =
  | "slot_not_found"
  | "not_participant" // 自分がその枠の参加者でない（IDOR/誤り）
  | "no_profile"; // プロフィール未作成（gender 解決不可）

export interface IntentResult {
  error: IntentError | null;
  response: PaymentIntentResponse | null;
}

/** PaymentEntity → PaymentDTO（機微情報を落とす）。 */
export function toPaymentDTO(p: PaymentEntity): PaymentDTO {
  return {
    id: p.id,
    amountJpy: p.amount,
    currency: "JPY",
    isFirstFree: p.isFirstFree,
    status: p.status,
    slotId: p.slotId,
    paidAt: p.paidAt ? p.paidAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
  };
}

function toFeeQuote(amountJpy: number, chargeable: boolean, reason: FeeQuote["reason"]): FeeQuote {
  return { amountJpy, currency: "JPY", chargeable, reason };
}

/**
 * 自分の成立(Match)枠に対する決済 intent を作成する。
 *
 * 手順:
 *  1. 枠と参加者検証（IDOR防止: 自分がその枠の有効応募者であること）。
 *  2. プロフィールから gender、過去 accepted 数から初回判定の入力を解決。
 *  3. computeFee で課金可否を判定。
 *     - 非課金（女性/初回）: Payment(succeeded, amount=0, isFirstFree?) を冪等作成し、
 *       clientSecret=null・確定レスポンス。
 *     - 課金（男性2回目+）: 既存の与信があれば再利用、無ければ PaymentIntent を発行し
 *       Payment(requires_capture) を作成。clientSecret を返す。
 *
 * 冪等: 同一(slotId,userId)に既に Payment があれば再作成しない（二重課金防止）。
 */
export async function createIntentForSlot(
  userId: string,
  slotId: string
): Promise<IntentResult> {
  const repo = getRepo();
  const payments = getPaymentRepo();

  const slot = await repo.slots.findById(slotId);
  if (!slot) return { error: "slot_not_found", response: null };

  // IDOR: 自分がこの枠の有効応募者(applied/accepted)であることを必須にする。
  const myApp = await repo.applications.findBySlotAndUser(slotId, userId);
  if (!myApp || (myApp.status !== "applied" && myApp.status !== "accepted")) {
    return { error: "not_participant", response: null };
  }

  const profile = await repo.profiles.findByUserId(userId);
  if (!profile) return { error: "no_profile", response: null };

  // 既存決済があれば冪等に返す（二重課金/二重記録の防止）。
  const existing = await payments.findBySlotAndUser(slotId, userId);
  if (existing) {
    // reason は **gender と既存決済の実属性** から正規化する（isFirstFree だけから
    // 推測すると女性の非課金記録を male_paid と誤ラベルする / female は常に female_free）。
    let reason: FeeQuote["reason"];
    let chargeable: boolean;
    if (profile.gender === "female") {
      reason = "female_free";
      chargeable = false;
    } else if (existing.isFirstFree) {
      reason = "male_first_free";
      chargeable = false;
    } else {
      reason = "male_paid";
      // 未確定（与信中/作成済）なら confirm 待ち＝課金対象。succeeded/canceled 等は確定済。
      chargeable =
        existing.status === "requires_capture" ||
        existing.status === "created" ||
        existing.status === "requires_action";
    }
    return {
      error: null,
      response: {
        quote: toFeeQuote(existing.amount, chargeable, reason),
        clientSecret: null, // 既存intentの client_secret は再発行しない（再confirm前提）。
        payment: toPaymentDTO(existing),
      },
    };
  }

  // 初回判定: 自分自身の過去 accepted（今回の応募を含むため、今回分を除く）。
  const pastAll = await payments.countPastAcceptedParticipations(userId);
  // 今回の枠への応募が accepted の場合、それは「過去」ではないので 1 引く（初回を正しく判定）。
  const pastAcceptedCount = myApp.status === "accepted" ? Math.max(0, pastAll - 1) : pastAll;

  const feeMaleJpy = slot.feeMale || env.participationFeeJpy;
  const fee = computeFee({
    gender: profile.gender,
    pastAcceptedCount,
    feeMaleJpy,
  });

  // --- 非課金（女性 / 男性初回）: 確定記録を作り、課金不要レスポンス。-----------
  if (!fee.chargeable) {
    const payment = await payments.create({
      userId,
      slotId,
      amount: 0,
      isFirstFree: fee.reason === "male_first_free",
      status: "succeeded", // 非課金は即確定（実課金なし）。
      stripePaymentIntentId: null,
      note: fee.reason, // 状態の要約のみ（PIIなし）。
    });
    return {
      error: null,
      response: {
        quote: toFeeQuote(0, false, fee.reason),
        clientSecret: null,
        payment: toPaymentDTO(payment),
      },
    };
  }

  // --- 課金（男性2回目+）: PaymentIntent を発行し与信(requires_capture)を作る。-----
  // capture（確定課金）は confirm（成立後）で行う＝不成立では課金されない。
  const intent = await createPaymentIntent({
    amountJpy: fee.amountJpy,
    // metadata は内部IDのみ（カード/個人情報は禁止＝stripe-mock 側でも防御）。
    metadata: { userId, slotId },
  });
  const payment = await payments.create({
    userId,
    slotId,
    amount: fee.amountJpy,
    isFirstFree: false,
    status: "requires_capture",
    stripePaymentIntentId: intent.id,
    note: "male_paid",
  });
  return {
    error: null,
    response: {
      quote: toFeeQuote(fee.amountJpy, true, "male_paid"),
      clientSecret: intent.clientSecret,
      payment: toPaymentDTO(payment),
    },
  };
}

/** confirm の結果区分。 */
export type ConfirmError = "not_found" | "forbidden" | "not_confirmable";

export interface ConfirmResult {
  error: ConfirmError | null;
  payment: PaymentEntity | null;
}

/**
 * （モック）支払い成功化。成立確定後の確定課金（capture→succeeded）に対応。
 * IDOR防止: 自分の Payment のみ confirm 可（userId 一致を必須）。
 *
 * - 既に succeeded → 冪等にそのまま返す（二重課金しない）。
 * - requires_capture / requires_action / created → capture して succeeded。
 * - canceled/refunded/failed → confirm 不可。
 */
export async function confirmPayment(
  userId: string,
  paymentId: string
): Promise<ConfirmResult> {
  const payments = getPaymentRepo();
  const p = await payments.findById(paymentId);
  if (!p) return { error: "not_found", payment: null };
  // IDOR: 他人の Payment は操作不可。
  if (p.userId !== userId) return { error: "forbidden", payment: null };

  if (p.status === "succeeded") {
    return { error: null, payment: p }; // 冪等。
  }
  if (p.status === "canceled" || p.status === "refunded" || p.status === "failed") {
    return { error: "not_confirmable", payment: null };
  }

  // capture（モックは succeeded を返す）。実 Stripe では capture API を叩く。
  if (p.stripePaymentIntentId) {
    await capturePaymentIntent(p.stripePaymentIntentId);
  }
  const updated = await payments.setStatus(p.id, "succeeded");
  return { error: null, payment: updated };
}

/** 自分の決済履歴（mine）。 */
export async function listMyPayments(userId: string): Promise<PaymentEntity[]> {
  return getPaymentRepo().listByUser(userId);
}

// =============================================================================
// S8 — ドタキャン罰金（no-show penalty）課金。spec 要望5。
// 正典: docs/01_s8_spec.md 要望5 / docs/backend/api-contract-s8-foundation.md。
//
// ルール（厳守）:
//  - no-show 確定（同席者2人以上が「来なかった」と報告 = domain/noshow.isNoShowConfirmed）
//    後にのみ呼ぶ。確定判定そのものは noshow-service が行い、本関数は「課金」に徹する。
//  - 額は domain/payment.penaltyAmountJpy()（=¥5,000）一律。性別/参加歴に依らない。
//  - **冪等**: 同一(slotId, ratee)に既に no_show_penalty があれば再課金しない
//    （二重課金防止）。参加費(participation)とは type で区別するため、参加費が
//    あっても no-show 罰金は別途1件だけ作る。
//  - 課金は登録カードへ即時確定（参加費の「与信→成立後capture」とは異なり、
//    既に発生済みのペナルティなので succeeded で確定記録を作る）。本番は実 Stripe、
//    今は stripe-mock（createPaymentIntent→capture）。
// =============================================================================

/** chargeNoShowPenalty の結果区分。 */
export interface NoShowPenaltyResult {
  /** 今回新たに課金したか（既存があれば false=冪等スキップ）。 */
  charged: boolean;
  /** 作成 or 既存の罰金 Payment（in-memory 実装は常に返す）。 */
  payment: PaymentEntity | null;
}

/**
 * ドタキャン罰金 ¥5,000 を ratee（来なかった人）に課金する。
 *
 * @param rateeUserId no-show が確定した対象ユーザー（罰金を負う人）。
 * @param slotId      対象イベント枠。
 * @returns charged（今回課金したか）+ payment。
 *
 * 冪等: 既に (slotId, ratee, no_show_penalty) があれば課金せず既存を返す。
 * 実 Stripe 差し替え: createPaymentIntent/capturePaymentIntent は stripe-mock。
 *   本番では登録済みカード(stripeCustomerId)へ off_session 課金に置き換える。
 */
export async function chargeNoShowPenalty(
  rateeUserId: string,
  slotId: string
): Promise<NoShowPenaltyResult> {
  const payments = getPaymentRepo();

  // 冪等: 同一(枠, 対象)の罰金が既にあれば二重課金しない。
  const existing = await payments.findBySlotUserAndType(
    slotId,
    rateeUserId,
    "no_show_penalty"
  );
  if (existing) {
    return { charged: false, payment: existing };
  }

  const amountJpy = penaltyAmountJpy();

  // Stripe(モック): PaymentIntent を作成し即 capture（ペナルティは発生済みのため確定課金）。
  // metadata は内部IDのみ（カード/PIIは入れない＝stripe-mock 側でも防御）。
  const intent = await createPaymentIntent({
    amountJpy,
    metadata: { userId: rateeUserId, slotId, kind: "no_show_penalty" },
  });
  await capturePaymentIntent(intent.id);

  const payment = await payments.create({
    userId: rateeUserId,
    slotId,
    amount: amountJpy,
    isFirstFree: false,
    type: "no_show_penalty",
    status: "succeeded", // ペナルティは確定課金（capture 済み）。
    stripePaymentIntentId: intent.id,
    note: "no_show_penalty", // 状態の要約のみ（PIIなし）。
  });

  return { charged: true, payment };
}
