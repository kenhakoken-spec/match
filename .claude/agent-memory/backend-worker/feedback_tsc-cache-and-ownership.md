---
name: feedback-tsc-cache-and-ownership
description: tsc --noEmit can falsely report rc0 from its incremental cache while next build correctly fails; and how to verify backend gates when a parallel worker's files break the shared build
metadata:
  type: feedback
---

Two traps hit during S2 backend (2026-05-30), both about trusting a green gate that isn't real:

1. **`tsc --noEmit` rc0 is a LIE when `tsconfig.tsbuildinfo` is stale.** The repo's `tsconfig.json` has `"incremental": true`. A plain `./node_modules/.bin/tsc --noEmit` reported **rc0 / 0 errors**, while `next build` on the same tree failed type-checking with real `TS2614`/`TS2305`/`TS2305` errors in frontend files. The cause: incremental tsc reused cached results for files it considered unchanged and never re-checked them. **`next build`'s "Linting and checking validity of types" phase was authoritative; the cached tsc was not.** This is the concrete S2 instance of the stale-signal trap in [[feedback-verification-trust]].
   **How to apply:** Before trusting `tsc --noEmit` as a gate, delete the cache first: `rm -f tsconfig.tsbuildinfo && ./node_modules/.bin/tsc --noEmit`. When `tsc` rc0 disagrees with `next build`, believe `next build`.

2. **Verifying backend gates when a parallel worker breaks the shared `next build`.** frontend-worker's untracked WIP (`src/app/_lib/api-s2.ts`, `types-s2.ts`, and S2 pages under `src/app/(tabs)/`, `src/app/slots/[id]/`, `src/app/admin/slots/`) had compile errors that fail the joint `next build` — and per api-contract §5 those files are frontend-owned, so I must NOT fix them. To prove MY backend is sound despite the shared build failing:
   - Get the per-file error list: `tsc --noEmit 2>&1 | grep 'error TS' | sed -E 's/\(.*//' | sort -u` → confirm every file is frontend-owned (`src/app/_lib/**`, `src/app/(tabs)/**`, `src/app/slots/**`, `src/app/admin/slots/**`), zero in `src/lib/**` or `src/app/api/**`.
   - Type-check only backend surface under the real tsconfig: write a temp `/tmp/tsconfig.backend.json` that `"extends"` the repo tsconfig, sets `"incremental": false`, and `"include"`s only `src/lib/**/*.ts` + `src/app/api/**/*.ts` → `tsc -p` it → rc0 proves backend compiles under project settings.
   - Run the curl E2E against `next dev` (routes compile on-demand, so the API works even when sibling frontend pages don't compile).
   **Why:** completion requires real output; "the shared build fails but it's not my files" must be *demonstrated*, not asserted. Reporting the frontend breakage honestly (with the file list) as a non-backend blocker is correct — silently editing frontend-owned files to make the build green would violate §5.

Related: [[feedback-verification-trust]], [[project-master-plan]].
