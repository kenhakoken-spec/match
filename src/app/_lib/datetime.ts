// src/app/_lib/datetime.ts — ISO8601 → Japanese date/time formatting for S2.
// Kept separate from the S1-owned date.ts (which is birthdate-only). Uses a fixed
// JST offset for display so SSR/CSR agree regardless of server timezone (the
// contract emits +09:00 ISO strings).

const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];

// Parse an ISO string and return its parts in JST (+09:00).
function jstParts(iso: string): {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  wd: number;
} {
  const date = new Date(iso);
  // Shift to JST by reading UTC parts of (utc + 9h).
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return {
    y: jst.getUTCFullYear(),
    mo: jst.getUTCMonth() + 1,
    d: jst.getUTCDate(),
    h: jst.getUTCHours(),
    mi: jst.getUTCMinutes(),
    wd: jst.getUTCDay(),
  };
}

// "6/13(金)"
export function formatDateShort(iso: string): string {
  const p = jstParts(iso);
  return `${p.mo}/${p.d}(${WEEKDAYS_JA[p.wd]})`;
}

// "19:30"
export function formatTime(iso: string): string {
  const p = jstParts(iso);
  return `${p.h}:${String(p.mi).padStart(2, "0")}`;
}

// "6/13(金) 19:30"
export function formatDateTime(iso: string): string {
  return `${formatDateShort(iso)} ${formatTime(iso)}`;
}

// For grouping/sorting ascending by start time.
export function startMillis(iso: string): number {
  return new Date(iso).getTime();
}
