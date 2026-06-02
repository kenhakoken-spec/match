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

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// 日付主役カード(#2)・カレンダー(#3)用。JST(+09:00)で構成要素を返す。
// weekdayIndex 0=日…6=土(曜日色の判定に使う) / ymdKey は日付グルーピングのキー。
// 既存 jstParts を再利用するため SSR/CSR で一致する(サーバTZに依存しない)。
export function jstDateParts(iso: string): {
  year: number;
  month: number;
  day: number;
  weekday: string;
  weekdayIndex: number;
  time: string;
  ymdKey: string;
} {
  const p = jstParts(iso);
  return {
    year: p.y,
    month: p.mo,
    day: p.d,
    weekday: WEEKDAYS_JA[p.wd],
    weekdayIndex: p.wd,
    time: `${p.h}:${pad2(p.mi)}`,
    ymdKey: `${p.y}-${pad2(p.mo)}-${pad2(p.d)}`,
  };
}

// 曜日色クラス(design-system §1 既存トークンの流用 / s11 §2.2)。
// 0=日→accent-600(暖色) / 6=土→state-info(青み) / 平日→ink-700。
// 原色の赤青は使わない。色のみに依存しない(曜日文字を必ず併記する前提)。
export function weekdayColorClass(weekdayIndex: number): string {
  if (weekdayIndex === 0) return "text-accent-600";
  if (weekdayIndex === 6) return "text-state-info";
  return "text-ink-700";
}

// カレンダーの ymdKey を作る(年・月・日から)。jstDateParts の ymdKey と同形式。
export function ymdKeyOf(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}
