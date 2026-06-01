// src/app/_lib/api-s2.ts — S2 client fetch helpers (frozen contract: api-contract-s2.md §2/§3).
//
// Mirrors S1 src/app/_lib/api.ts conventions: fetch with cache:"no-store", JSON,
// reuse ApiCallError for non-2xx (it already extracts error.code/message).
// Backend for S2 is implemented; but per task spec we FALL BACK to contract-shaped
// dummy data on any fetch failure so every UI state renders for review. Each
// fallback is marked `// FALLBACK` and is trivial to delete.
//
// Frontend re-declares the S2 DTO types here (per contract §5: backend owns
// src/lib/types.ts; frontend may define its own and reconcile at integration —
// these are kept byte-identical to src/lib/types.ts so the swap is mechanical).

import { ApiCallError } from "./api";
import { atJstTime } from "./relative-date";
import type { Area } from "./types";
export type { Gender } from "./types";

// ---- S2 DTOs (identical to src/lib/types.ts §S2) ----
export type SlotStatus = "open" | "filled" | "confirmed" | "done" | "canceled";
export type ApplicationStatus = "applied" | "accepted" | "canceled";

export interface SlotConditions {
  minAge: number | null;
  maxAge: number | null;
  requiresBadge: "premium" | null;
}

export interface SlotDTO {
  id: string;
  datetimeStart: string; // ISO8601
  area: Area;
  capacityPerGender: number;
  filled: { male: number; female: number };
  conditions: SlotConditions;
  status: SlotStatus;
  feeMale: number;
}

export type EligibilityReasonCode =
  | "identity_required"
  | "profile_required"
  | "age_out_of_range"
  | "badge_required"
  | "gender_full"
  | "already_applied"
  | "slot_closed";

export interface SlotEligibility {
  canApply: boolean;
  reasons: EligibilityReasonCode[];
}

export interface SlotDetailDTO extends SlotDTO {
  myApplication: { status: ApplicationStatus } | null;
  eligibility: SlotEligibility;
}

export interface ApplicationListItem {
  slot: SlotDTO;
  status: ApplicationStatus;
}

export interface AdminCreateSlotInput {
  datetimeStart: string;
  area: Area;
  minAge?: number | null;
  maxAge?: number | null;
  requiresBadge?: boolean;
}

// ---- fetch helpers ----
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new ApiCallError(res.status, await res.json().catch(() => null));
  }
  return (await res.json()) as T;
}

// Apply needs the raw 409 body (it carries `reasons`), so it has its own caller
// below; this generic postJson is used where only success matters.
async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new ApiCallError(res.status, await res.json().catch(() => null));
  }
  return (await res.json()) as T;
}

function buildQuery(params?: { area?: Area; from?: string; to?: string }): string {
  if (!params) return "";
  const q = new URLSearchParams();
  if (params.area) q.set("area", params.area);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  const s = q.toString();
  return s ? `?${s}` : "";
}

// ---- FALLBACK dummy data (contract-shaped). Delete when relying on live backend. ----
// Covers: 通常枠 / 20代限定枠[条件不足] / 優良バッジ限定枠 / 満員 / 応募済 — so every
// S2 UI state is exercised in screenshots even without the backend reachable.
// 日付は「今から数日後」の相対生成（陳腐化防止 / s9_spec §4）。集合時刻の雰囲気は維持。
function fbSlots(): SlotDTO[] {
  return [
    {
      id: "slot_ebisu_01",
      datetimeStart: atJstTime(4, 19, 30),
      area: "ebisu",
      capacityPerGender: 3,
      filled: { male: 1, female: 2 },
      conditions: { minAge: null, maxAge: null, requiresBadge: null },
      status: "open",
      feeMale: 2000,
    },
    {
      id: "slot_ikebukuro_20s",
      datetimeStart: atJstTime(11, 20, 0),
      area: "ikebukuro",
      capacityPerGender: 3,
      filled: { male: 2, female: 2 },
      conditions: { minAge: 20, maxAge: 29, requiresBadge: null },
      status: "open",
      feeMale: 2000,
    },
    {
      id: "slot_ginza_premium",
      datetimeStart: atJstTime(5, 18, 0),
      area: "ginza",
      capacityPerGender: 3,
      filled: { male: 2, female: 3 },
      conditions: { minAge: null, maxAge: null, requiresBadge: "premium" },
      status: "open",
      feeMale: 2000,
    },
    {
      id: "slot_ebisu_applied",
      datetimeStart: atJstTime(18, 19, 0),
      area: "ebisu",
      capacityPerGender: 3,
      filled: { male: 1, female: 1 },
      conditions: { minAge: null, maxAge: null, requiresBadge: null },
      status: "open",
      feeMale: 2000,
    },
  ];
}

function fallbackDetail(id: string): SlotDetailDTO {
  const slots = fbSlots();
  const base = slots.find((s) => s.id === id) ?? slots[0];
  if (id === "slot_ikebukuro_20s") {
    // 20代限定で年齢条件外 → 応募不可 (条件不足を danger にしない側の代表ケース)
    return {
      ...base,
      myApplication: null,
      eligibility: { canApply: false, reasons: ["age_out_of_range"] },
    };
  }
  if (id === "slot_ginza_premium") {
    return {
      ...base,
      myApplication: null,
      eligibility: { canApply: false, reasons: ["badge_required"] },
    };
  }
  if (id === "slot_ebisu_applied") {
    return {
      ...base,
      myApplication: { status: "applied" },
      eligibility: { canApply: false, reasons: ["already_applied"] },
    };
  }
  // 通常枠: 応募可
  return { ...base, myApplication: null, eligibility: { canApply: true, reasons: [] } };
}

// 応募一覧（U-07）。日付は相対生成（陳腐化防止 / s9_spec §4）。slot_*_done/conf は
// fbSlots() の対応枠と同じ日付感に揃える（成立=ebisu +4 / 確定=ginza +5）。
function fbApplications(): ApplicationListItem[] {
  return [
    // 成立(支払い待ち相当 = accepted) — U-07 で最も目立たせる行
    {
      slot: {
        id: "slot_ebisu_done",
        datetimeStart: atJstTime(4, 19, 30),
        area: "ebisu",
        capacityPerGender: 3,
        filled: { male: 3, female: 3 },
        conditions: { minAge: null, maxAge: null, requiresBadge: null },
        status: "filled",
        feeMale: 2000,
      },
      status: "accepted",
    },
    // 募集中
    {
      slot: fbSlots()[3],
      status: "applied",
    },
    // 確定済イベント
    {
      slot: {
        id: "slot_ginza_conf",
        datetimeStart: atJstTime(5, 18, 0),
        area: "ginza",
        capacityPerGender: 3,
        filled: { male: 3, female: 3 },
        conditions: { minAge: null, maxAge: null, requiresBadge: "premium" },
        status: "confirmed",
        feeMale: 2000,
      },
      status: "accepted",
    },
    // 取消済
    {
      slot: {
        id: "slot_ebisu_cancelled",
        datetimeStart: atJstTime(2, 19, 0),
        area: "ebisu",
        capacityPerGender: 3,
        filled: { male: 1, female: 0 },
        conditions: { minAge: null, maxAge: null, requiresBadge: null },
        status: "canceled",
        feeMale: 2000,
      },
      status: "canceled",
    },
  ];
}

// ---- public API ----
export async function fetchSlots(params?: {
  area?: Area;
  from?: string;
  to?: string;
}): Promise<SlotDTO[]> {
  try {
    const data = await getJson<{ slots: SlotDTO[] }>(`/api/slots${buildQuery(params)}`);
    return data.slots;
  } catch {
    return fbSlots(); // FALLBACK
  }
}

export async function fetchSlot(id: string): Promise<SlotDetailDTO> {
  try {
    const data = await getJson<{ slot: SlotDetailDTO }>(
      `/api/slots/${encodeURIComponent(id)}`,
    );
    return data.slot;
  } catch {
    return fallbackDetail(id); // FALLBACK
  }
}

// POST apply. Success → 200 { application:{status}, matched }.
// Not eligible → 409 { error:{ code, message, reasons } }. We read the raw body
// directly here so `reasons` (which ApiCallError does not retain) survives.
// Any non-409 failure is treated as a network/server error (genericError in UI).
export interface ApplyOutcome {
  ok: boolean;
  status?: ApplicationStatus;
  matched?: boolean;
  reasons?: EligibilityReasonCode[];
  networkError?: boolean;
}

export async function applyToSlot(id: string): Promise<ApplyOutcome> {
  let res: Response;
  try {
    res = await fetch(`/api/slots/${encodeURIComponent(id)}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
  } catch {
    return { ok: false, networkError: true };
  }

  const body = (await res.json().catch(() => null)) as
    | { application?: { status: ApplicationStatus }; matched?: boolean; error?: { reasons?: EligibilityReasonCode[] } }
    | null;

  if (res.ok && body?.application) {
    return { ok: true, status: body.application.status, matched: body.matched };
  }
  if (res.status === 409) {
    return { ok: false, reasons: body?.error?.reasons ?? [] };
  }
  return { ok: false, networkError: true };
}

export async function fetchApplications(): Promise<ApplicationListItem[]> {
  try {
    const data = await getJson<{ items: ApplicationListItem[] }>("/api/applications");
    return data.items;
  } catch {
    return fbApplications(); // FALLBACK
  }
}

// --- admin ---
export async function createSlot(input: AdminCreateSlotInput): Promise<SlotDTO> {
  const data = await postJson<{ slot: SlotDTO }>("/api/admin/slots", input);
  return data.slot;
}

export async function fetchAdminSlots(): Promise<SlotDTO[]> {
  try {
    const data = await getJson<{ slots: SlotDTO[] }>("/api/admin/slots");
    return data.slots;
  } catch {
    return fbSlots(); // FALLBACK
  }
}

