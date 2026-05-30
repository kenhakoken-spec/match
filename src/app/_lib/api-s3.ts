// src/app/_lib/api-s3.ts — S3 client fetch helpers (frozen contract: api-contract-s3.md §2/§3).
//
// The S3 backend is implemented and wired. The TRUTH for these shapes is
// src/lib/types.ts + src/lib/serializers.ts + the route handlers (read those —
// the .md is a guide). Envelopes verified against the real route handlers:
//   GET  /api/matches/mine                 -> { items: MatchSummaryDTO[] }
//   GET  /api/matches/[id]                 -> { match: MatchDetailDTO }              (401/404)
//   GET  /api/admin/matches                -> { items: AdminMatchSummaryDTO[] }      (401/403)
//   GET  /api/admin/matches/[id]           -> { match: AdminMatchDetailDTO }         (403/404)
//   POST /api/admin/matches/[id]/venue     -> { match: AdminMatchDetailDTO }         (400/403/404/409)
//   POST /api/admin/matches/[id]/notify    -> { match: AdminMatchDetailDTO, notified } (409 venue_not_set)
//   POST /api/admin/matches/[id]/complete  -> { slotStatus, attendedIncremented }    (409 not_notified)
//
// Per contract §6 the backend owns src/lib/types.ts; the frontend re-declares the
// S3 DTO shapes here, kept BYTE-IDENTICAL to src/lib/types.ts so the swap is
// mechanical. On any network failure we FALL BACK to contract-shaped dummy data
// (`// FALLBACK`) so every UI state renders for review even with no backend.

import { ApiCallError } from "./api";
import type { Area, Gender } from "./types";

// ---- S3 DTOs (mirror src/lib/types.ts §S3 exactly) ----
export type MatchStatus = "pending_venue" | "venue_set" | "notified";

// Venue: surfaced to USERS only when match.status === "notified" (serializers.ts).
export interface VenueDTO {
  venueName: string;
  venueUrl: string | null;
  reservationName: string;
  meetingPlace: string | null;
}

// Minimal member info (PII minimal): displayName + gender ONLY. Never age, full
// name or lineUserId — admin and user DTOs both use this shape (serializers.ts).
export interface MatchMemberDTO {
  displayName: string;
  gender: Gender;
}

// User-facing match detail (U-08). venue present ONLY when notified; members are
// returned at every stage (the serializer gates only the venue).
export interface MatchDetailDTO {
  id: string;
  slot: { datetimeStart: string; area: Area };
  status: MatchStatus;
  venue: VenueDTO | null;
  members: MatchMemberDTO[];
}

// User-facing list row (/api/matches/mine). No venue body — only confirmed flag.
export interface MatchSummaryDTO {
  id: string;
  slotId: string;
  slot: { datetimeStart: string; area: Area };
  status: MatchStatus;
  venueConfirmed: boolean;
}

// Admin list row (A-04). Admin sees the venue at every stage (運営 is the host).
export interface AdminMatchSummaryDTO {
  id: string;
  slotId: string;
  slot: { datetimeStart: string; area: Area };
  status: MatchStatus;
  matchedAt: string; // ISO
  filled: { male: number; female: number };
  venue: VenueDTO | null;
}

// Admin detail (A-05). Same minimal members (NO age — serializers use MatchMemberDTO).
export interface AdminMatchDetailDTO {
  id: string;
  slotId: string;
  slot: { datetimeStart: string; area: Area; capacityPerGender: number };
  status: MatchStatus;
  matchedAt: string; // ISO
  filled: { male: number; female: number };
  venue: VenueDTO | null;
  members: MatchMemberDTO[];
}

// venue POST body (contract §2). venueUrl/meetingPlace optional.
export interface AdminVenueInput {
  venueName: string;
  venueUrl?: string;
  reservationName: string;
  meetingPlace?: string;
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

// ---- FALLBACK dummy data (contract-shaped). Delete when relying on live backend. ----
// Members are displayName + gender ONLY (mirrors the PII-minimal serializer).
const FB_MEMBERS: MatchMemberDTO[] = [
  { displayName: "ハル", gender: "male" },
  { displayName: "ミナ", gender: "female" },
  { displayName: "ソウ", gender: "male" },
  { displayName: "リカ", gender: "female" },
  { displayName: "ケン", gender: "male" },
  { displayName: "アヤ", gender: "female" },
];

const FB_VENUE: VenueDTO = {
  venueName: "個室イタリアン トラットリア恵比寿",
  venueUrl: "https://example.com/r/ebisu-trattoria",
  reservationName: "田中",
  meetingPlace: "恵比寿駅 西口 18:55 集合",
};

// User-facing fallback. venue hidden until notified per contract.
// id "pending_venue"/"venue_set" -> that pre-notified state; else -> notified.
function fallbackMatchDetail(id: string): MatchDetailDTO {
  const slot = { datetimeStart: "2026-06-13T19:30:00+09:00", area: "ebisu" as Area };
  if (id === "pending_venue" || id === "venue_set") {
    return { id, slot, status: id, venue: null, members: FB_MEMBERS };
  }
  return { id, slot, status: "notified", venue: FB_VENUE, members: FB_MEMBERS };
}

const FB_ADMIN_MATCHES: AdminMatchSummaryDTO[] = [
  {
    id: "m_pending",
    slotId: "slot_ebisu_done",
    slot: { datetimeStart: "2026-06-13T19:30:00+09:00", area: "ebisu" },
    status: "pending_venue",
    matchedAt: "2026-05-28T11:00:00.000Z",
    filled: { male: 3, female: 3 },
    venue: null,
  },
  {
    id: "m_venue_set",
    slotId: "slot_ginza_conf",
    slot: { datetimeStart: "2026-06-14T18:00:00+09:00", area: "ginza" },
    status: "venue_set",
    matchedAt: "2026-05-27T09:00:00.000Z",
    filled: { male: 3, female: 3 },
    venue: FB_VENUE,
  },
  {
    id: "m_notified",
    slotId: "slot_ikebukuro_conf",
    slot: { datetimeStart: "2026-06-20T20:00:00+09:00", area: "ikebukuro" },
    status: "notified",
    matchedAt: "2026-05-26T08:00:00.000Z",
    filled: { male: 3, female: 3 },
    venue: FB_VENUE,
  },
];

// Admin detail fallback. Admin always sees the full roster (displayName/gender).
function fallbackAdminMatchDetail(id: string): AdminMatchDetailDTO {
  const meta = FB_ADMIN_MATCHES.find((m) => m.id === id);
  const slot = meta
    ? { ...meta.slot, capacityPerGender: 3 }
    : { datetimeStart: "2026-06-13T19:30:00+09:00", area: "ebisu" as Area, capacityPerGender: 3 };
  const status = meta?.status ?? "pending_venue";
  const venue = status === "notified" || status === "venue_set" ? FB_VENUE : null;
  return {
    id,
    slotId: meta?.slotId ?? "slot_ebisu_done",
    slot,
    status,
    matchedAt: meta?.matchedAt ?? "2026-05-28T11:00:00.000Z",
    filled: { male: 3, female: 3 },
    venue,
    members: FB_MEMBERS,
  };
}

// ---- public API (user-facing, U-08 + U-07) ----
export async function fetchMatch(id: string): Promise<MatchDetailDTO> {
  try {
    const data = await getJson<{ match: MatchDetailDTO }>(`/api/matches/${encodeURIComponent(id)}`);
    return data.match;
  } catch {
    return fallbackMatchDetail(id); // FALLBACK
  }
}

export async function fetchMyMatches(): Promise<MatchSummaryDTO[]> {
  try {
    const data = await getJson<{ items: MatchSummaryDTO[] }>("/api/matches/mine");
    return data.items;
  } catch {
    // FALLBACK — one confirmed + one arranging, so U-07 reflects both states.
    return [
      {
        id: "m_notified",
        slotId: "slot_ginza_conf",
        slot: { datetimeStart: "2026-06-14T18:00:00+09:00", area: "ginza" },
        status: "notified",
        venueConfirmed: true,
      },
      {
        id: "m_pending",
        slotId: "slot_ebisu_done",
        slot: { datetimeStart: "2026-06-13T19:30:00+09:00", area: "ebisu" },
        status: "pending_venue",
        venueConfirmed: false,
      },
    ];
  }
}

// ---- public API (admin, A-04 / A-05) ----
export async function fetchAdminMatches(): Promise<AdminMatchSummaryDTO[]> {
  try {
    const data = await getJson<{ items: AdminMatchSummaryDTO[] }>("/api/admin/matches");
    return data.items;
  } catch {
    return FB_ADMIN_MATCHES; // FALLBACK
  }
}

export async function fetchAdminMatch(id: string): Promise<AdminMatchDetailDTO> {
  try {
    const data = await getJson<{ match: AdminMatchDetailDTO }>(
      `/api/admin/matches/${encodeURIComponent(id)}`,
    );
    return data.match;
  } catch {
    return fallbackAdminMatchDetail(id); // FALLBACK
  }
}

export interface SaveVenueOutcome {
  ok: boolean;
  match?: AdminMatchDetailDTO;
  errorCode?: string;
  errorMessage?: string;
}

export async function saveVenue(id: string, body: AdminVenueInput): Promise<SaveVenueOutcome> {
  try {
    const data = await postJson<{ match: AdminMatchDetailDTO }>(
      `/api/admin/matches/${encodeURIComponent(id)}/venue`,
      body,
    );
    return { ok: true, match: data.match };
  } catch (err) {
    if (err instanceof ApiCallError) {
      return { ok: false, errorCode: err.code ?? undefined, errorMessage: err.message };
    }
    // FALLBACK — echo the saved venue onto a venue_set match for review.
    const base = fallbackAdminMatchDetail(id);
    return {
      ok: true,
      match: {
        ...base,
        status: "venue_set",
        venue: {
          venueName: body.venueName,
          venueUrl: body.venueUrl ?? null,
          reservationName: body.reservationName,
          meetingPlace: body.meetingPlace ?? null,
        },
      },
    };
  }
}

// notify returns { match, notified } — `notified` is the count of NotificationLog
// rows created (one per member). There is NO per-member array from the backend;
// the A-05 screen renders the per-member "送信済" list from the match roster + this
// count (the wireframe's "6/6 配信成功" evidence), all sourced from real data.
export interface NotifyOutcome {
  ok: boolean;
  match?: AdminMatchDetailDTO;
  notified?: number;
  errorCode?: string;
  errorMessage?: string;
}

export async function sendNotify(id: string): Promise<NotifyOutcome> {
  try {
    const data = await postJson<{ match: AdminMatchDetailDTO; notified: number }>(
      `/api/admin/matches/${encodeURIComponent(id)}/notify`,
    );
    return { ok: true, match: data.match, notified: data.notified };
  } catch (err) {
    if (err instanceof ApiCallError) {
      return { ok: false, errorCode: err.code ?? undefined, errorMessage: err.message };
    }
    // FALLBACK — mark notified with the full roster count.
    const base = fallbackAdminMatchDetail(id);
    const notifiedMatch: AdminMatchDetailDTO = {
      ...base,
      status: "notified",
      venue: base.venue ?? FB_VENUE,
    };
    return { ok: true, match: notifiedMatch, notified: notifiedMatch.members.length };
  }
}

export interface CompleteOutcome {
  ok: boolean;
  slotStatus?: string;
  attendedIncremented?: number;
  errorCode?: string;
  errorMessage?: string;
}

export async function completeMatch(id: string): Promise<CompleteOutcome> {
  try {
    const data = await postJson<{ slotStatus: string; attendedIncremented: number }>(
      `/api/admin/matches/${encodeURIComponent(id)}/complete`,
    );
    return { ok: true, slotStatus: data.slotStatus, attendedIncremented: data.attendedIncremented };
  } catch (err) {
    if (err instanceof ApiCallError) {
      return { ok: false, errorCode: err.code ?? undefined, errorMessage: err.message };
    }
    // FALLBACK — pretend the slot completed with the full roster attended.
    return { ok: true, slotStatus: "done", attendedIncremented: 6 };
  }
}
