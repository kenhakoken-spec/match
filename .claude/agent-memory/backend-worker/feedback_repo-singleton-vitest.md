---
name: feedback-repo-singleton-vitest
description: getRepo() caches _repo across the whole vitest worker — a repo-backed test can get PrismaRepo if an earlier file polluted it; instantiate MemoryRepo directly
metadata:
  type: feedback
---

`src/lib/repo/index.ts` `getRepo()` caches `let _repo` at module scope and never
resets it. Under vitest, **all test files in one worker share that module state**,
so the FIRST `getRepo()` call anywhere wins for the whole run. If an earlier test
file ran with `NODE_ENV=production` or `MOCK_DB=0` and triggered `getRepo()`, the
singleton becomes a `PrismaRepo` permanently — and a later repo-backed test that
sets `MOCK_DB=1`/`NODE_ENV=test` in its own `beforeEach` STILL gets the cached
PrismaRepo. Symptom: `Cannot read properties of undefined (reading 'get')` thrown
from `memory.ts` (PrismaRepo method runs against an uninitialized in-memory store),
or `expected 'PrismaRepo' to be 'MemoryRepo'`.

**Why this bit (S8 Haiku, 2026-05-31):** my `haiku-verify-flow.test.ts` followed
the exact convention of the passing `venue-service.test.ts` (set `MOCK_DB=1`+
`NODE_ENV=test` in beforeEach, call `__resetMemoryStore()`, then `getRepo()`) and
still got PrismaRepo — because run ORDER, not the test's own setup, decides the
singleton. The sibling tests pass only by luck of ordering. `index.ts` exposes no
reset and is not mine to edit.

**How to apply:** for a repo-backed unit test whose assertions are repo-impl-agnostic,
**bypass `getRepo()` entirely** — `import { MemoryRepo, __resetMemoryStore } from
"@/lib/repo/memory"` and `new MemoryRepo()`. MemoryRepo reads the shared
`globalThis.__mappStore` via `store()`, so `__resetMemoryStore()` (fresh seed) still
applies. This is order-independent and faithful (in prod-mock the route's `getRepo()`
returns that same MemoryRepo). Confirm by running the file ISOLATED (`vitest run <file>`)
— isolation removes cross-file pollution, so a green isolated run + a green full-suite
run together prove it. Related: [[feedback-vitest-route-testing]], [[feedback-verification-trust]].

Also: `process.env.NODE_ENV` (and any key) is typed read-only by @types/node — you
cannot `delete process.env.NODE_ENV` or assign it directly (TS2704/TS2540). Use the
repo's convention: `(process.env as Record<string,string>)[key] = v` / `delete (…)[key]`.
And `IdDocType` values are `drivers_license|passport|my_number_card|health_insurance|
residence_card` — there is no `"license"`.
