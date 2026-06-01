// src/app/_lib/api-badge.ts — S6 client fetch helpers (frozen contract: api-contract-s6.md §2/§3).
//
// The S6 badge backend is implemented. The TRUTH for these shapes is
// src/lib/badge-types.ts + the route handlers under src/app/api/badges/** and
// src/app/api/admin/badges/** (read those — the .md is a guide). Envelopes
// verified against the real route handlers:
//   GET  /api/badges/mine          -> { badges: BadgeDTO[], progress: BadgeProgressDTO }
//   GET  /api/admin/badges         -> { items: AdminBadgeRowDTO[] }          (401/403)
//   POST /api/admin/badges/grant   -> BadgeMutationResultDTO                 (400/403/404 user_not_found)
//   POST /api/admin/badges/revoke  -> BadgeMutationResultDTO                 (400/403)
//
// Per the parallel-impl rule the backend owns src/lib/badge-types.ts; the
// frontend re-declares the S6 DTO shapes here, kept BYTE-IDENTICAL to
// src/lib/badge-types.ts so the swap is mechanical. On any network failure we
// FALL BACK to contract-shaped dummy data (`// FALLBACK`) so every UI state
// renders for review even with no backend (same pattern as api-s3.ts).

import { ApiCallError } from "./api";
import { daysAgo } from "./relative-date";

// ---- S6 DTOs (mirror src/lib/badge-types.ts exactly) ----
export type BadgeTypeDTO = "premium";

export interface BadgeDTO {
  type: BadgeTypeDTO;
  grantedAt: string; // ISO8601
}

// premium 取得基準 (api-contract-s6.md §0): ratingAvg ≥ 4.0 かつ ratingCount ≥ 5
// かつ attendedCount ≥ 2。UI の進捗ターゲット表示に使う(事実情報・煽らない)。
export const PREMIUM_CRITERIA = {
  ratingAvg: 4.0,
  ratingCount: 5,
  attendedCount: 2,
} as const;

export interface BadgeProgressDTO {
  hasPremium: boolean;
  ratingAvg: number;
  ratingCount: number;
  attendedCount: number;
  remaining: {
    ratingAvg: number;
    ratingCount: number;
    attendedCount: number;
  };
}

export interface MyBadgesDTO {
  badges: BadgeDTO[];
  progress: BadgeProgressDTO;
}

// Admin row (A-10). PII-minimal: userId(内部cuid) + displayName まで。
export interface AdminBadgeRowDTO {
  userId: string;
  displayName: string | null;
  type: BadgeTypeDTO;
  grantedAt: string; // ISO8601
  grantedBy: string | null; // "system"=自動付与 / admin userId=手動
}

// grant/revoke の結果(冪等性を呼び出し側へ伝える)。
export interface BadgeMutationResultDTO {
  userId: string;
  type: BadgeTypeDTO;
  outcome: "granted" | "already" | "revoked" | "absent";
  badge: BadgeDTO | null;
}

// ---- fetch helpers (mirror api-s3.ts) ----
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

// ---- FALLBACK dummy data (contract-shaped). Delete when relying on live backend. ----
// Default fallback for /api/badges/mine: NOT yet premium, with partial progress —
// so the mypage "進捗" path renders for review (the more interesting state).
// Shows the factual progress UI without any FOMO framing (design-system §4.7 E).
const FB_MY_BADGES: MyBadgesDTO = {
  badges: [],
  progress: {
    hasPremium: false,
    ratingAvg: 4.2,
    ratingCount: 3,
    attendedCount: 1,
    // remaining = max(0, criteria - current). avg already met (0), count 2 short, attended 1 short.
    remaining: { ratingAvg: 0, ratingCount: 2, attendedCount: 1 },
  },
};

// 付与済バッジ一覧（A-10）。grantedAt は「今から数日前」の相対生成（陳腐化防止 / s9_spec §4）。
function fbAdminBadges(): AdminBadgeRowDTO[] {
  return [
    {
      userId: "u_premium_auto",
      displayName: "ミナ",
      type: "premium",
      grantedAt: daysAgo(5),
      grantedBy: "system",
    },
    {
      userId: "u_premium_manual",
      displayName: "ハル",
      type: "premium",
      grantedAt: daysAgo(7),
      grantedBy: "u_admin",
    },
    {
      userId: "u_premium_noname",
      displayName: null,
      type: "premium",
      grantedAt: daysAgo(9),
      grantedBy: "system",
    },
  ];
}

// ---- public API (user-facing, U-10 mypage) ----
export async function fetchMyBadges(): Promise<MyBadgesDTO> {
  try {
    return await getJson<MyBadgesDTO>("/api/badges/mine");
  } catch {
    return FB_MY_BADGES; // FALLBACK
  }
}

// ---- public API (admin, A-10) ----
export async function fetchAdminBadges(): Promise<AdminBadgeRowDTO[]> {
  try {
    const data = await getJson<{ items: AdminBadgeRowDTO[] }>("/api/admin/badges");
    return data.items;
  } catch {
    return fbAdminBadges(); // FALLBACK
  }
}

export interface BadgeMutationOutcome {
  ok: boolean;
  result?: BadgeMutationResultDTO;
  errorCode?: string;
  errorMessage?: string;
}

export async function grantBadge(userId: string): Promise<BadgeMutationOutcome> {
  try {
    const result = await postJson<BadgeMutationResultDTO>("/api/admin/badges/grant", { userId });
    return { ok: true, result };
  } catch (err) {
    if (err instanceof ApiCallError) {
      return { ok: false, errorCode: err.code ?? undefined, errorMessage: err.message };
    }
    // FALLBACK — pretend a fresh grant succeeded so the admin flow renders for review.
    return {
      ok: true,
      result: {
        userId,
        type: "premium",
        outcome: "granted",
        badge: { type: "premium", grantedAt: new Date().toISOString() },
      },
    };
  }
}

export async function revokeBadge(userId: string): Promise<BadgeMutationOutcome> {
  try {
    const result = await postJson<BadgeMutationResultDTO>("/api/admin/badges/revoke", { userId });
    return { ok: true, result };
  } catch (err) {
    if (err instanceof ApiCallError) {
      return { ok: false, errorCode: err.code ?? undefined, errorMessage: err.message };
    }
    // FALLBACK — pretend the revoke succeeded.
    return {
      ok: true,
      result: { userId, type: "premium", outcome: "revoked", badge: null },
    };
  }
}
