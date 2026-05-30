---
name: feedback-vitest-route-testing
description: How to unit-test Next.js route handlers / server-only modules under vitest(node) in this repo — mock server-only + next/headers without top-level vars
metadata:
  type: feedback
---

To unit-test code that imports `"server-only"` or calls `cookies()` from `next/headers`
(route handlers like `src/app/api/auth/*`, and `src/lib/auth/session.ts`) under the
repo's vitest `node` environment, both must be mocked or the test file fails to even
collect (0 tests):

- `vi.mock("server-only", () => ({}))` — the real module throws on import in node.
- `vi.mock("next/headers", () => ({ ... cookies: () => ({get,set}) ... }))` — real
  `cookies()` throws `DynamicServerError` outside a Next request context.

**Gotcha that cost several iterations:** `vi.mock` factories are HOISTED above imports,
so a factory must NOT reference a top-level `const` (e.g. an outer `cookieStore` Map) —
vitest throws `ReferenceError: Cannot access 'X' before initialization` / "make sure
there are no top level variables inside". Put the store INSIDE the factory and persist
it on `globalThis` if you need it across `cookies()` calls. Also remember to delete any
`afterEach` cleanup that referenced the removed outer variable (left a stale
`cookieStore.clear()` that broke all tests AND tripped `tsc` TS2339).

With those mocks, calling a route's `POST(req as never)` with a `new Request(...)`
works end-to-end (it hit the real MemoryRepo and returned the seed-admin user, 200).
Reset `process.env` (NODE_ENV / MOCK_*) per-test in `afterEach` from a saved snapshot.

**Why:** the SEC-001/002 task required unit tests for prod-404, prod-secret-throw, and
fail-close flag logic — all of which live behind server-only/route boundaries. Related:
[[feedback-verification-trust]], [[feedback-tsc-cache-and-ownership]].
