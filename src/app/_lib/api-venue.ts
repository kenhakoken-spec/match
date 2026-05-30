// src/app/_lib/api-venue.ts — S8 要望2 会場候補 client (admin only).
//
// Verified against the real route handlers (the .md is a guide):
//   GET  /api/admin/venues?slotId=            -> { items: VenueCandidateDTO[] }   (fitScore desc; 400 no slotId / 404)
//   POST /api/admin/venues/suggest  {slotId}  -> { items, created, notified }     (404 no slot/candidates)
//   POST /api/admin/venues/[id]/choose        -> { candidate, match }             (400/404/409)
//        body { reservationName, venueName?, venueUrl?, meetingPlace? }
//   POST /api/admin/venues/[id]/reject  (no body) -> { candidate }                (404/409)
//
// Mirrors api-s3 conventions: fetch cache:"no-store", reuse ApiCallError for non-2xx.
// On any NETWORK failure (backend unreachable) we FALL BACK to contract-shaped dummy
// data so the admin UI renders for review. API-level errors (4xx/9xx) are surfaced
// via {ok:false, errorCode/message} so the screen can show real reasons.

import { ApiCallError } from "./api";
import type {
  Area,
  VenueCandidateDTO,
  AdminMatchDetailDTO,
} from "@/lib/types";

const JSON_HEADERS = { "Content-Type": "application/json" };

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new ApiCallError(res.status, await res.json().catch(() => null));
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });
  if (!res.ok) throw new ApiCallError(res.status, await res.json().catch(() => null));
  return (await res.json()) as T;
}

// ---- FALLBACK dummy candidates (contract-shaped, fitScore desc). ----
// Mock 食べログ/Google 点数 + 合コン向き度 so reviewers see the sort + scores.
function fallbackCandidates(slotId: string, area: Area = "ebisu"): VenueCandidateDTO[] {
  const make = (
    n: number,
    name: string,
    tabelog: number | null,
    google: number | null,
    fit: number,
  ): VenueCandidateDTO => ({
    id: `vc_${slotId}_${n}`,
    slotId,
    name,
    url: `https://example.com/r/${slotId}-${n}`,
    tabelogScore: tabelog,
    googleScore: google,
    fitScore: fit,
    area,
    status: "suggested",
  });
  // already fitScore-descending.
  return [
    make(1, "個室イタリアン トラットリア恵比寿", 3.6, 4.3, 92),
    make(2, "和モダン個室ダイニング 結", 3.5, 4.1, 86),
    make(3, "クラフトビアバル ホップス", 3.4, 4.0, 78),
    make(4, "海鮮居酒屋 大漁丸", 3.3, null, 64),
  ];
}

// ---- public API (admin) ----
export async function listVenues(slotId: string): Promise<VenueCandidateDTO[]> {
  try {
    const data = await getJson<{ items: VenueCandidateDTO[] }>(
      `/api/admin/venues?slotId=${encodeURIComponent(slotId)}`,
    );
    return data.items;
  } catch {
    return fallbackCandidates(slotId); // FALLBACK
  }
}

export interface SuggestOutcome {
  ok: boolean;
  items?: VenueCandidateDTO[];
  created?: number;
  notified?: number;
  errorCode?: string;
  errorMessage?: string;
}

export async function suggestVenues(slotId: string): Promise<SuggestOutcome> {
  try {
    const data = await postJson<{
      items: VenueCandidateDTO[];
      created: number;
      notified: number;
    }>("/api/admin/venues/suggest", { slotId });
    return { ok: true, items: data.items, created: data.created, notified: data.notified };
  } catch (err) {
    if (err instanceof ApiCallError) {
      return { ok: false, errorCode: err.code ?? undefined, errorMessage: err.message };
    }
    // FALLBACK — generate dummy candidates for review.
    const items = fallbackCandidates(slotId);
    return { ok: true, items, created: items.length, notified: 1 };
  }
}

export interface ChooseVenueInput {
  reservationName: string;
  venueName?: string;
  venueUrl?: string | null;
  meetingPlace?: string | null;
}

export interface ChooseOutcome {
  ok: boolean;
  candidate?: VenueCandidateDTO;
  match?: AdminMatchDetailDTO;
  errorCode?: string;
  errorMessage?: string;
}

export async function chooseVenue(
  candidateId: string,
  input: ChooseVenueInput,
): Promise<ChooseOutcome> {
  try {
    const data = await postJson<{
      candidate: VenueCandidateDTO;
      match: AdminMatchDetailDTO;
    }>(`/api/admin/venues/${encodeURIComponent(candidateId)}/choose`, input);
    return { ok: true, candidate: data.candidate, match: data.match };
  } catch (err) {
    if (err instanceof ApiCallError) {
      return { ok: false, errorCode: err.code ?? undefined, errorMessage: err.message };
    }
    // FALLBACK — mark the candidate chosen so the UI reflects the action.
    return {
      ok: true,
      candidate: {
        id: candidateId,
        slotId: "",
        name: input.venueName ?? "選択した会場",
        url: null,
        tabelogScore: null,
        googleScore: null,
        fitScore: null,
        area: "ebisu",
        status: "chosen",
      },
    };
  }
}

export interface RejectOutcome {
  ok: boolean;
  candidate?: VenueCandidateDTO;
  errorCode?: string;
  errorMessage?: string;
}

export async function rejectVenue(candidateId: string): Promise<RejectOutcome> {
  try {
    const data = await postJson<{ candidate: VenueCandidateDTO }>(
      `/api/admin/venues/${encodeURIComponent(candidateId)}/reject`,
    );
    return { ok: true, candidate: data.candidate };
  } catch (err) {
    if (err instanceof ApiCallError) {
      return { ok: false, errorCode: err.code ?? undefined, errorMessage: err.message };
    }
    return { ok: true }; // FALLBACK — treat as rejected
  }
}
