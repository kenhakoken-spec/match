// =============================================================================
// matching-app — Stripe モック (S4) — 契約§2
// 正典: docs/backend/api-contract-s4.md §2 / docs/backend/payment.md §2,§6
//
// MOCK_PAYMENT 時は PaymentIntent をローカルで擬似発行する:
//   id = "pi_mock_xxxx", client_secret = "<id>_secret_xxxx", status 遷移を返す。
// 実 Stripe への差し替え点は TODO で明示（PaymentIntent 作成/capture/cancel/署名検証）。
//
// セキュリティ / PII（payment.md §6 厳守）:
//   - カード番号・有効期限・CVC・氏名などカード値は **一切受け取らず・保持しない**。
//     実運用では Stripe Elements/PaymentSheet がカードを直接 Stripe に送る。サーバーは
//     PaymentIntent と client_secret しか扱わない（PCI 範囲を負わない）。
//   - metadata には内部ID(userId/slotId/paymentId)と金額/状態のみ。個人情報は入れない。
//   - STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET は env 経由（コードに固定しない）。
// =============================================================================

import "server-only";
import crypto from "node:crypto";
import type { PaymentStatusValue } from "@/lib/payment-types";

/**
 * MOCK_PAYMENT 判定（フェイルクローズ・env.ts の mockFlag と同方針）。
 * 既定 ON の条件: 本番でない、かつ STRIPE_SECRET_KEY 未設定 or MOCK_PAYMENT!="0"。
 *  - 本番(NODE_ENV==="production") かつ STRIPE_SECRET_KEY 設定済 → モック無効（実 Stripe）。
 *  - STRIPE_SECRET_KEY 未設定 → 実 Stripe を叩けないので（本番でも）モックにフォールバックし
 *    500 連発を避ける。ただし本番運用では必ず実キーを設定する前提（payment.md §7）。
 */
export function isMockPaymentEnabled(): boolean {
  const isProd = (process.env.NODE_ENV ?? "development") === "production";
  const hasSecret = (process.env.STRIPE_SECRET_KEY ?? "").length > 0;
  // 明示的に MOCK_PAYMENT=0 かつ 実キーあり → 実 Stripe を使う。
  if (process.env.MOCK_PAYMENT === "0" && hasSecret) return false;
  // 本番 + 実キーあり + MOCK_PAYMENT 未強制 → 実 Stripe。
  if (isProd && hasSecret) return false;
  // それ以外（非production / 実キーなし）はモック。
  return true;
}

/** Stripe PaymentIntent の(モック)最小表現。実 Stripe の戻りからも同形に正規化する。 */
export interface MockPaymentIntent {
  id: string; // "pi_mock_xxxx"（実 Stripe は "pi_xxxx"）
  clientSecret: string; // "<id>_secret_xxxx"
  status: PaymentStatusValue;
  amount: number; // 最小通貨単位(円)
  currency: string; // "jpy"
}

/** PaymentIntent 作成の入力。metadata は内部IDのみ（カード/個人情報は禁止）。 */
export interface CreateIntentParams {
  amountJpy: number;
  /** 内部突合用メタデータ。userId/slotId/paymentId などの内部IDのみ。 */
  metadata: Record<string, string>;
}

function rand(n = 16): string {
  return crypto.randomBytes(n).toString("hex");
}

/**
 * PaymentIntent を作成する。
 * capture_method は manual（成立までキャプチャしない＝不成立で課金しない／payment.md §1）。
 * モックでは作成直後 status="requires_capture"（与信確保済み相当）とする。
 *
 * TODO(実 Stripe 差し替え): isMockPaymentEnabled()===false のとき
 *   const stripe = new Stripe(env.stripeSecretKey);
 *   const pi = await stripe.paymentIntents.create({
 *     amount: params.amountJpy, currency: "jpy", capture_method: "manual",
 *     automatic_payment_methods: { enabled: true }, metadata: params.metadata });
 *   return normalize(pi);
 * 現状は実キー未着のため未実装（呼び出し側は本関数のモックを使う）。
 */
export async function createPaymentIntent(
  params: CreateIntentParams
): Promise<MockPaymentIntent> {
  // 防御: カード値らしきキーが metadata に混入していないか（PII漏れ防止）。
  assertNoCardData(params.metadata);
  const id = `pi_mock_${rand(12)}`;
  return {
    id,
    clientSecret: `${id}_secret_${rand(12)}`,
    status: "requires_capture",
    amount: params.amountJpy,
    currency: "jpy",
  };
}

/**
 * 与信済み PaymentIntent をキャプチャ（確定課金）する。
 * 成立確定後にのみ呼ぶ（payment.md §1 ⑧）。モックは status="succeeded" を返す。
 *
 * TODO(実 Stripe): await stripe.paymentIntents.capture(paymentIntentId)。
 */
export async function capturePaymentIntent(
  paymentIntentId: string
): Promise<{ id: string; status: PaymentStatusValue }> {
  return { id: paymentIntentId, status: "succeeded" };
}

/**
 * PaymentIntent をキャンセル（不成立/取消時。課金されない・payment.md §1 ⑨）。
 *
 * TODO(実 Stripe): await stripe.paymentIntents.cancel(paymentIntentId)。
 */
export async function cancelPaymentIntent(
  paymentIntentId: string
): Promise<{ id: string; status: PaymentStatusValue }> {
  return { id: paymentIntentId, status: "canceled" };
}

/**
 * Webhook 署名検証（枠のみ）。実検証は STRIPE_WEBHOOK_SECRET で行う（TODO）。
 * モック時は常に「検証成功」とみなしつつ、本番で署名/秘密が無い場合は false を返す
 * （フェイルクローズ: 署名検証の枠を必ず通す）。
 *
 * TODO(実 Stripe):
 *   const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
 *   検証失敗は例外 → false。
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  webhookSecret: string
): boolean {
  if (isMockPaymentEnabled()) {
    // モック: 署名ヘッダの存在のみ最低限チェック（中身は検証しない＝TODO）。
    return typeof rawBody === "string";
  }
  // 実 Stripe 経路: 署名 or 秘密が無ければ拒否（フェイルクローズ）。
  if (!signature || webhookSecret.length === 0) return false;
  // TODO: stripe.webhooks.constructEvent による HMAC 検証に差し替え。
  // 現状は実検証未実装のため、実キー運用に入るまでは false（受理しない）にしておく。
  return false;
}

/** metadata にカード値らしきキーが無いことを保証（PII/PCI 防御）。 */
function assertNoCardData(metadata: Record<string, string>): void {
  const forbidden = [
    "number",
    "card",
    "cardnumber",
    "pan",
    "cvc",
    "cvv",
    "exp",
    "expiry",
    "exp_month",
    "exp_year",
    "name",
    "cardholder",
  ];
  for (const k of Object.keys(metadata)) {
    if (forbidden.includes(k.toLowerCase().replace(/[^a-z_]/g, ""))) {
      throw new Error("metadata must not contain card/PII fields");
    }
  }
}
