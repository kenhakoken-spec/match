// Unit tests for the FALLBACK relative-date generators (s9_spec §4).
// These are Date.now()-based pure functions; we pin the clock with fake timers
// so assertions are deterministic without changing the signatures.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { daysFromNow, daysAgo, atJstTime } from "./relative-date";

// A fixed instant: 2026-06-02T03:00:00Z = JST 2026-06-02(火) 12:00.
const FIXED_NOW = new Date("2026-06-02T03:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("daysFromNow", () => {
  it("returns a valid ISO8601 (UTC) string", () => {
    const iso = daysFromNow(3);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Number.isNaN(Date.parse(iso))).toBe(false);
  });

  it("moves forward for positive n and back for negative n", () => {
    const future = new Date(daysFromNow(5)).getTime();
    const past = new Date(daysFromNow(-5)).getTime();
    expect(future).toBe(FIXED_NOW.getTime() + 5 * 86_400_000);
    expect(past).toBe(FIXED_NOW.getTime() - 5 * 86_400_000);
  });

  it("n=0 is the current instant", () => {
    expect(daysFromNow(0)).toBe(FIXED_NOW.toISOString());
  });
});

describe("daysAgo", () => {
  it("is the mirror of daysFromNow", () => {
    expect(daysAgo(7)).toBe(daysFromNow(-7));
    expect(new Date(daysAgo(7)).getTime()).toBeLessThan(FIXED_NOW.getTime());
  });
});

describe("atJstTime", () => {
  it("emits a fixed +09:00 offset string with the requested wall-clock time", () => {
    // 11 days from JST 2026-06-02 = 2026-06-13, at 19:30 JST.
    expect(atJstTime(11, 19, 30)).toBe("2026-06-13T19:30:00+09:00");
  });

  it("zero-pads month/day/hour/minute", () => {
    // +7 days -> 2026-06-09, 09:05 JST.
    expect(atJstTime(7, 9, 5)).toBe("2026-06-09T09:05:00+09:00");
  });

  it("supports negative offsets for past 'done' events", () => {
    // -4 days from 2026-06-02 = 2026-05-29, 19:30 JST.
    expect(atJstTime(-4, 19, 30)).toBe("2026-05-29T19:30:00+09:00");
  });

  it("the emitted instant equals the intended JST wall clock", () => {
    // 19:30 +09:00 == 10:30Z the same calendar day.
    const iso = atJstTime(0, 19, 30);
    expect(new Date(iso).toISOString()).toBe("2026-06-02T10:30:00.000Z");
  });
});
