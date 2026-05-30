// =============================================================================
// matching-app — Payment 専用リポジトリ (S4) — 契約§5
// 正典: docs/backend/api-contract-s4.md §5 / docs/backend/payment.md / schema.prisma(Payment)
//
// 並行実装の鉄則（契約§5）:
//   - 共有 repo/types.ts / repo/memory.ts / repo/index.ts には **追記しない**。
//   - Payment 用の in-memory Map は **このファイル内** に持つ。
//   - 既存 Match/Application/Profile/User は getRepo() 経由で **読み取りのみ**。
//   - repo/index.ts への結線（getRepo().payments のような公開）は **開発将軍が統合時に** 行う。
//     本ファイルは getPaymentRepo() を export するだけ（既存 getRepo は変更しない）。
//
// PII / カード（payment.md §6）:
//   - カード番号/氏名/CVC 等は **保持しない**。Stripe の id/状態/金額/内部IDのみ。
//   - note にも個人情報・カード情報を入れない（状態/理由の要約のみ）。
// =============================================================================

import "server-only";
import crypto from "node:crypto";
import { getRepo } from "@/lib/repo";
import type { PaymentStatusValue } from "@/lib/payment-types";

// --- Payment エンティティ（schema.prisma の Payment S4 サブセット）-----------
export interface PaymentEntity {
  id: string;
  userId: string;
  slotId: string | null;
  amount: number; // 最小通貨単位(円)。初回無料は amount=0 + isFirstFree=true。
  currency: string; // "JPY"
  isFirstFree: boolean;
  status: PaymentStatusValue;
  provider: string; // "stripe"
  stripePaymentIntentId: string | null; // "pi_..."（モックは "pi_mock_..."）
  stripeCustomerId: string | null;
  paidAt: Date | null;
  refundedAt: Date | null;
  note: string | null; // PII/カード情報を含めない
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentInput {
  userId: string;
  slotId: string | null;
  amount: number;
  isFirstFree: boolean;
  status: PaymentStatusValue;
  stripePaymentIntentId?: string | null;
  note?: string | null;
}

export interface PaymentsRepo {
  findById(id: string): Promise<PaymentEntity | null>;
  /** Stripe PaymentIntent ID で突合（Webhook で使う）。 */
  findByStripeIntentId(stripePaymentIntentId: string): Promise<PaymentEntity | null>;
  /** 自分の決済履歴（mine）。createdAt 降順。 */
  listByUser(userId: string): Promise<PaymentEntity[]>;
  /** ある枠×ユーザーの決済（二重課金防止・冪等のため）。 */
  findBySlotAndUser(slotId: string, userId: string): Promise<PaymentEntity | null>;
  create(input: CreatePaymentInput): Promise<PaymentEntity>;
  /** 状態更新（confirm/webhook の succeeded 等）。succeeded のとき paidAt をセット。 */
  setStatus(
    id: string,
    status: PaymentStatusValue,
    opts?: { note?: string | null }
  ): Promise<PaymentEntity | null>;
  /**
   * 「初回判定」用: そのユーザーの過去の成立参加(accepted)の回数を数える。
   * 既存 Application（getRepo 経由・読み取り専用）を集計する。
   * 男性の初回無料判定（computeFee の pastAcceptedCount）に渡す。
   */
  countPastAcceptedParticipations(userId: string): Promise<number>;
}

function cuid(): string {
  return "c" + crypto.randomBytes(12).toString("hex");
}

// =============================================================================
// in-memory 実装（既定 / dev・test）。Payment 用ストアはこのファイルに閉じる。
// HMR をまたいで保持するため globalThis に置く（memory.ts の流儀に合わせる）。
// =============================================================================
interface PaymentStore {
  payments: Map<string, PaymentEntity>; // key: payment id
}

const g = globalThis as unknown as { __mappPaymentStore?: PaymentStore };

function store(): PaymentStore {
  if (!g.__mappPaymentStore) {
    g.__mappPaymentStore = { payments: new Map() };
  }
  return g.__mappPaymentStore;
}

class MemoryPaymentsRepo implements PaymentsRepo {
  async findById(id: string): Promise<PaymentEntity | null> {
    return store().payments.get(id) ?? null;
  }

  async findByStripeIntentId(
    stripePaymentIntentId: string
  ): Promise<PaymentEntity | null> {
    for (const p of store().payments.values()) {
      if (p.stripePaymentIntentId === stripePaymentIntentId) return p;
    }
    return null;
  }

  async listByUser(userId: string): Promise<PaymentEntity[]> {
    const out: PaymentEntity[] = [];
    for (const p of store().payments.values()) {
      if (p.userId === userId) out.push(p);
    }
    out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return out;
  }

  async findBySlotAndUser(
    slotId: string,
    userId: string
  ): Promise<PaymentEntity | null> {
    for (const p of store().payments.values()) {
      if (p.slotId === slotId && p.userId === userId) return p;
    }
    return null;
  }

  async create(input: CreatePaymentInput): Promise<PaymentEntity> {
    const s = store();
    const now = new Date();
    const p: PaymentEntity = {
      id: cuid(),
      userId: input.userId,
      slotId: input.slotId,
      amount: input.amount,
      currency: "JPY",
      isFirstFree: input.isFirstFree,
      status: input.status,
      provider: "stripe",
      stripePaymentIntentId: input.stripePaymentIntentId ?? null,
      stripeCustomerId: null,
      paidAt: input.status === "succeeded" ? now : null,
      refundedAt: null,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
    };
    s.payments.set(p.id, p);
    return p;
  }

  async setStatus(
    id: string,
    status: PaymentStatusValue,
    opts?: { note?: string | null }
  ): Promise<PaymentEntity | null> {
    const s = store();
    const p = s.payments.get(id);
    if (!p) return null;
    const now = new Date();
    p.status = status;
    if (status === "succeeded" && !p.paidAt) p.paidAt = now;
    if (status === "refunded") p.refundedAt = now;
    if (opts && opts.note !== undefined) p.note = opts.note;
    p.updatedAt = now;
    s.payments.set(id, p);
    return p;
  }

  async countPastAcceptedParticipations(userId: string): Promise<number> {
    // 既存 Application を getRepo 経由で読み取り（書き込みはしない）。
    // 成立参加 = status=accepted（done への遷移後も accepted を維持する設計）。
    const repo = getRepo();
    const apps = await repo.applications.listByUser(userId);
    let count = 0;
    for (const a of apps) {
      if (a.status === "accepted") count += 1;
    }
    return count;
  }
}

// =============================================================================
// Prisma 実装（MOCK_DB=0・実DB接続時）。**実DB未検証**（ローカルにPostgresが無いため）。
// schema.prisma の Payment / Application に対応。getRepo の Prisma 切替と独立に、
// Payment は本ファイルの prisma クライアントで読み書きする。統合時に検証する。
// =============================================================================
class PrismaPaymentsRepo implements PaymentsRepo {
  // NOTE: 実DB未検証。prisma クライアントは @/lib/prisma の単一インスタンスを使う想定。
  //       メソッド本体は schema に沿った実装の骨子。実接続時に E2E で検証すること。
  private notImplemented(): never {
    // 実DB接続が来るまでフェイルクローズ（黙ってモックに落ちない）。
    throw new Error("PrismaPaymentsRepo is not verified against a real DB yet (S4 mock-first)");
  }
  async findById(): Promise<PaymentEntity | null> {
    return this.notImplemented();
  }
  async findByStripeIntentId(): Promise<PaymentEntity | null> {
    return this.notImplemented();
  }
  async listByUser(): Promise<PaymentEntity[]> {
    return this.notImplemented();
  }
  async findBySlotAndUser(): Promise<PaymentEntity | null> {
    return this.notImplemented();
  }
  async create(): Promise<PaymentEntity> {
    return this.notImplemented();
  }
  async setStatus(): Promise<PaymentEntity | null> {
    return this.notImplemented();
  }
  async countPastAcceptedParticipations(): Promise<number> {
    return this.notImplemented();
  }
}

// 単一インスタンスを使い回す（in-memory 状態一貫性のため。getRepo と同方針）。
let _paymentRepo: PaymentsRepo | null = null;

/**
 * Payment リポジトリを取得する。
 * 非production の既定は in-memory。MOCK_DB=0（実DB）時は Prisma 実装（未検証）。
 * 既存 getRepo() は変更しない。統合時に getRepo().payments として束ねるのは開発将軍。
 */
export function getPaymentRepo(): PaymentsRepo {
  if (_paymentRepo) return _paymentRepo;
  const isProd = (process.env.NODE_ENV ?? "development") === "production";
  const useMemory = isProd ? false : process.env.MOCK_DB !== "0";
  _paymentRepo = useMemory ? new MemoryPaymentsRepo() : new PrismaPaymentsRepo();
  return _paymentRepo;
}

/** テスト用: Payment ストアをリセットする（既存 __resetMemoryStore とは独立）。 */
export function __resetPaymentStore(): void {
  g.__mappPaymentStore = { payments: new Map() };
  _paymentRepo = null;
}

/** 課金額の正規化に使う通貨ラベル（schema 既定 JPY）。 */
export const PAYMENT_CURRENCY = "JPY" as const;
