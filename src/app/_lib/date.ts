// Client-side date helpers. These MIRROR the server guards in
// src/lib/domain (calcAge / isAdult per contract §3) so the UI can block
// under-18 submission before the request — but the server remains authoritative
// (it returns 400 code:"under_age" and we surface that too).

export function calcAge(birthdate: Date, now: Date = new Date()): number {
  let age = now.getFullYear() - birthdate.getFullYear();
  const m = now.getMonth() - birthdate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birthdate.getDate())) {
    age -= 1;
  }
  return age;
}

export function isAdult(birthdate: Date, now: Date = new Date()): boolean {
  return calcAge(birthdate, now) >= 18;
}

// Build a "YYYY-MM-DD" string from select values, or null if incomplete/invalid.
export function toBirthdateString(
  year: string,
  month: string,
  day: string,
): string | null {
  if (!year || !month || !day) return null;
  const y = Number(year);
  const mo = Number(month);
  const d = Number(day);
  const date = new Date(y, mo - 1, d);
  // Reject impossible dates (e.g. Feb 30 normalising forward).
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  const mm = String(mo).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

export function parseBirthdate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}
