// src/app/_lib/relative-date.ts — relative-date generators for FALLBACK dummy data.
//
// The client FALLBACK fixtures (api-public.ts / api-rating.ts / api-payment.ts /
// api-s2.ts / api-s3.ts) used to hardcode absolute 2026-05/06 dates. Those go
// stale as time passes (future slots become past, "recent" history drifts away).
// These pure, Date.now()-based helpers regenerate the SAME *shapes* (e.g. a 19:30
// JST gathering "a few days from now", a payment "paid 12 days ago") relative to
// the current moment, so the preview stays believable forever.
//
// Scope: PREVIEW DATA ONLY. Public DTOs / types / function signatures are
// unchanged — only the values fed into the fixtures move. Real data comes from
// the DB seed (already relative) when the backend is reachable.
//
// JST handling mirrors datetime.ts: we build the wall-clock instant in UTC and
// append the fixed "+09:00" offset, so the emitted ISO string reads as JST
// regardless of the runtime timezone (SSR/CSR agree).

const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * ISO8601 (UTC, `...Z`) for exactly `n` days from now (n may be negative for the
 * past). Preserves the current wall-clock time-of-day. Use for `createdAt` /
 * `paidAt` / `matchedAt`-style history timestamps where only the day matters.
 */
export function daysFromNow(n: number): string {
  return new Date(Date.now() + n * DAY_MS).toISOString();
}

/** Convenience alias for `daysFromNow(-n)` — reads naturally for past history. */
export function daysAgo(n: number): string {
  return daysFromNow(-n);
}

/**
 * ISO8601 with a fixed `+09:00` (JST) offset for a specific wall-clock time on
 * the day `daysOffset` days from "today" (today = the JST calendar day of now).
 * Seconds/millis are zeroed. Use for slot `datetimeStart` so the dummy gathering
 * keeps its intended JST hour (e.g. 19:30 集合) while sliding to a future date.
 *
 *   atJstTime(11, 19, 30) -> "2026-06-13T19:30:00+09:00" (11 days out, 19:30 JST)
 */
export function atJstTime(daysOffset: number, hh: number, mm: number): string {
  // Find today's JST calendar date by reading the UTC parts of (now + 9h).
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = jstNow.getUTCFullYear();
  const mo = jstNow.getUTCMonth();
  const d = jstNow.getUTCDate();
  // Build the target instant from JST wall-clock parts via Date.UTC, then shift
  // the day. Because we label it "+09:00" the numbers ARE the JST wall clock.
  const target = new Date(Date.UTC(y, mo, d + daysOffset, hh, mm, 0, 0));
  const Y = target.getUTCFullYear();
  const MO = pad2(target.getUTCMonth() + 1);
  const D = pad2(target.getUTCDate());
  const H = pad2(target.getUTCHours());
  const MI = pad2(target.getUTCMinutes());
  return `${Y}-${MO}-${D}T${H}:${MI}:00+09:00`;
}
