// src/app/_lib/api-payment.ts — S4 client fetch helpers (決済 / Payment).
//
// Mirrors the api-s3.ts pattern: imports ApiCallError from ./api, defines local
// getJson/postJson, and FALLS BACK to contract-shaped dummy data on any network
// failure so every U-14 state renders for review even with no backend.
//
// The TRUTH for these shapes is the REAL ROUTE HANDLERS (read those, not the .md):
//   POST /api/payments/intent   body { slotId }   -> { quote, clientSecret, payment }
//   POST /api/payments/confirm  body { paymentId } -> { payment }
//   GET  /api/payments/mine                        -> { payments }
// (intent keys on slotId — verified in src/app/api/payments/intent/route.ts.)
// Backend defines these in src/lib/payment-types.ts; we re-declare them here so the
// client bundle never pulls server-only domain code, kept identical for a mechanical swap.
//
// PII / security: we never send or store card data here. Card entry is delegated to
// Stripe (Elements/Checkout); this layer only carries the PaymentIntent id /
// client_secret / status / amount. See design-system.md §4.7C.

import { ApiCallError } from "./api";

// reason codes (mirror src/lib/domain/payment.ts FeeReason — slots-ui does not export it).
export type FeeReason = "female_free" | "male_first_free" | "male_paid";

export type PaymentStatusValue =
  | "created"
  | "requires_action"
  | "requires_capture"
  | "succeeded"
  | "canceled"
  | "refunded"
  | "failed";

export interface FeeQuote {
  amountJpy: number;
  currency: "JPY";
  chargeable: boolean;
  reason: FeeReason;
}

export interface PaymentDTO {
  id: string;
  amountJpy: number;
  currency: "JPY";
  isFirstFree: boolean;
  status: PaymentStatusValue;
  slotId: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface PaymentIntentResponse {
  quote: FeeQuote;
  /** Stripe(モック)の client_secret。課金時のみ。非課金(女性/初回)は null。 */
  clientSecret: string | null;
  payment: PaymentDTO;
}

export interface PaymentConfirmResponse {
  payment: PaymentDTO;
}

// ---- fetch helpers ----
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new ApiCallError(res.status, await res.json().catch(() => null));
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });
  if (!res.ok) throw new ApiCallError(res.status, await res.json().catch(() => null));
  return (await res.json()) as T;
}

// ---- public API -------------------------------------------------------------

/**
 * 成立(slot)に対する決済 intent を作成する。課金可否はサーバ(computeFee)が
 * 決め、quote.reason / quote.chargeable で返す。非課金なら payment は確定済
 * (status="succeeded")で clientSecret=null。課金時のみ confirm が必要。
 * 4xx(ApiCallError)は呼び出し側へ投げ、ネットワーク不通時のみ FALLBACK する。
 */
export async function createIntent(slotId: string): Promise<PaymentIntentResponse> {
  try {
    return await postJson<PaymentIntentResponse>("/api/payments/intent", { slotId });
  } catch (e) {
    if (e instanceof ApiCallError) throw e; // 認可/不正は UI でメッセージ分岐する
    return fallbackIntent(slotId); // FALLBACK (network only)
  }
}

/**
 * （モック）支払いを成功化する。本番では Stripe Elements/Checkout で 3DS 等を
 * 通過させたのち、webhook / confirm で succeeded を確定する。ここではカード値を
 * 一切扱わず、PaymentIntent の id 相当(payment.id)だけを渡す。
 */
export async function confirmPayment(paymentId: string): Promise<PaymentDTO> {
  try {
    const data = await postJson<PaymentConfirmResponse>("/api/payments/confirm", {
      paymentId,
    });
    return data.payment;
  } catch (e) {
    if (e instanceof ApiCallError) throw e;
    // FALLBACK (network only): echo a succeeded payment so the mock flow completes.
    return { ...fallbackPaymentBase(paymentId), status: "succeeded", paidAt: NOW };
  }
}

export async function fetchMyPayments(): Promise<PaymentDTO[]> {
  try {
    const data = await getJson<{ payments: PaymentDTO[] }>("/api/payments/mine");
    return data.payments ?? [];
  } catch {
    return FALLBACK_MINE; // FALLBACK
  }
}

// ---- FALLBACK fixtures (contract-shaped; static preview only) ---------------
// Keyed off slotId so screenshots can exercise each reason branch:
//   /payment/paid      -> male_paid (¥2,000, chargeable)
//   /payment/firstfree -> male_first_free
//   anything else      -> female_free
// These never run when the API answers (2xx OR a 4xx ApiCallError).

const NOW = "2026-05-30T12:00:00.000Z";

function fallbackPaymentBase(id: string): PaymentDTO {
  return {
    id,
    amountJpy: 0,
    currency: "JPY",
    isFirstFree: false,
    status: "created",
    slotId: null,
    paidAt: null,
    createdAt: NOW,
  };
}

function fallbackIntent(slotId: string): PaymentIntentResponse {
  if (slotId === "paid") {
    return {
      quote: { amountJpy: 2000, currency: "JPY", chargeable: true, reason: "male_paid" },
      clientSecret: "pi_mock_secret_paid",
      payment: {
        ...fallbackPaymentBase("pay_mock_paid"),
        amountJpy: 2000,
        status: "requires_capture",
        slotId,
      },
    };
  }
  if (slotId === "firstfree") {
    return {
      quote: { amountJpy: 0, currency: "JPY", chargeable: false, reason: "male_first_free" },
      clientSecret: null,
      payment: {
        ...fallbackPaymentBase("pay_mock_firstfree"),
        isFirstFree: true,
        status: "succeeded",
        slotId,
        paidAt: NOW,
      },
    };
  }
  return {
    quote: { amountJpy: 0, currency: "JPY", chargeable: false, reason: "female_free" },
    clientSecret: null,
    payment: {
      ...fallbackPaymentBase("pay_mock_free"),
      status: "succeeded",
      slotId,
      paidAt: NOW,
    },
  };
}

const FALLBACK_MINE: PaymentDTO[] = [
  {
    id: "pay_mock_h1",
    amountJpy: 2000,
    currency: "JPY",
    isFirstFree: false,
    status: "succeeded",
    slotId: "paid",
    paidAt: "2026-05-20T11:30:00.000Z",
    createdAt: "2026-05-20T11:29:00.000Z",
  },
  {
    id: "pay_mock_h2",
    amountJpy: 0,
    currency: "JPY",
    isFirstFree: true,
    status: "succeeded",
    slotId: "firstfree",
    paidAt: "2026-05-01T10:00:00.000Z",
    createdAt: "2026-05-01T09:59:00.000Z",
  },
];
