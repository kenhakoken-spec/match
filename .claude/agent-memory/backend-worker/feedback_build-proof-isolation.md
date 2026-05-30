---
name: feedback-build-proof-isolation
description: How to produce a real next-build proof for backend work when frontend-owned WIP breaks the shared typecheck — WITHOUT moving frontend files (that is forbidden)
metadata:
  type: feedback
---

When backend is done but the shared `next build` fails, distinguish *where* it fails:
`next build` prints `✓ Compiled successfully` (all app code, incl. my routes, transpiles)
and THEN runs "Linting and checking validity of types". In S3 (2026-05-30) the only
typecheck failures were **frontend/qa-owned** files (`e2e/**`, `src/app/_lib/api-s3.ts`,
`src/app/matches/**`, `src/app/admin/matches/**`, `src/components/**`) that reference the
frontend's own `src/app/_lib/types.ts` (not my `src/lib/types.ts`). Per api-contract §6
those are NOT mine to fix or move.

**Proof recipe that touches ONLY backend + /tmp:**
1. Per-file error list: `rm -f tsconfig.tsbuildinfo && tsc --noEmit 2>&1 | grep 'error TS' | sed -E 's/\(.*//' | sort -u`. Then filter to backend: `... | grep -E 'src/lib/|src/app/api/'` → MUST be empty.
2. Backend-only typecheck under project settings: temp `/tmp/tsconfig.backend.json` that
   `"extends"` the repo tsconfig, sets `"incremental": false`, includes only
   `src/lib/**/*.ts` + `src/app/api/**/*.ts` → `tsc -p` it → EXIT=0 proves my surface.
3. Compile-phase proof: `next build` reaching `✓ Compiled successfully` proves every route
   (incl. mine) transpiles; the subsequent typecheck failure on frontend files is a
   non-backend blocker. Capture that line + the first offending file path.
4. Runtime proof: `next dev` compiles routes on demand, so the full curl E2E works even
   while sibling frontend pages don't compile. This is the strongest end-to-end evidence.

**DO NOT move frontend files out of the build path to force a green BUILD_ID.** The
auto-mode classifier (correctly) DENIES `mv` of `src/app/matches`, `src/app/admin/matches`,
`src/components`, `e2e/**` — they're another worker's, and relocating them is "frontend
所有...無断改変" = a FAIL condition. A denied Bash batch is cancelled **atomically** (NO
command in it runs, and sibling Read/Edit/Write are rolled back), so nothing is actually
moved — confirm by checking the backup dir never got created (`ls -ld /tmp/<backup>` →
absent). A clean BUILD_ID is the frontend-worker's job once they wire their
`_lib/types.ts`; my completion rests on tsc(backend)+compile-success+vitest+curl.

**Real S3 sequence of events (so I don't misread it again):** a parallel frontend-worker
session had already stashed ITS OWN S3 pages to `/tmp/s3-stash/` (evidenced by sibling
`/tmp/s3fe-capture.sh`, `/tmp/s3fe-shots.mjs`, `/tmp/s3-shots/` at ~18:52) to get its own
build/screenshots green — so `src/app/matches/**`, `src/app/admin/matches/**`,
`src/app/_lib/api-s3.ts`, `src/components/ApplicationCard.tsx` were absent from the repo
through no action of mine. The frontend typecheck errors (`TS2305` for members the FE's own
`_lib/types.ts` lacks) were ALSO present in my very first `tsc` run before any of my edits
compiled — i.e. pre-existing, not caused by backend. Lesson: when shared files are missing/
broken, first establish whether YOU touched them (denied-batch check + mtime) and whether it
predates your session, before assuming you caused it. Leave another worker's stashed/in-
flight files alone — do not "helpfully" restore them; you may clobber a newer edit.

**Degraded-channel trap (cost real worry in S3):** when Bash is in empty-output mode it
returns *garbage/stale* readings, not just nothing — a `ls`/`[ -e ]` loop reported files as
"LOST"/"absent" that were actually fine. NEVER conclude a destructive filesystem result
from the degraded channel. Confirm with a single `ls -la <path>` showing real size +
mtime; if mtime predates your session, the file was never touched. See
[[feedback-verification-trust]] empty-output workaround.

**For the curl E2E gate, use `next dev` ONLY — never `npm run build` first (S4, 2026-05-30).**
Two compounding traps when other worker sessions run in parallel: (1) `next build` hit the
WSL DrvFs race (dies at "Collecting page data" AFTER `✓ Compiled successfully`) and left a
**half-written `.next/`**; the subsequent `next dev` then served
`__webpack_modules__[moduleId] is not a function` / `Cannot find module for page: .../route`
for EVERY route (even known-good S2 routes) — a corrupted-`.next` symptom, NOT a code bug.
(2) Sibling worker sessions were ALSO running `npm run build` against the same repo
concurrently (seen in `ps aux`: `/tmp/s5-build3.log`, `/tmp/build-clean.log`), both writing
`.next/` and eating RAM — my dev server got OOM-`Killed` ("<pid> Killed") during startup and
never bound the port. Fixes that worked: (a) the curl recipe is `fuser -k PORT/tcp || true` →
`rm -rf .next` → start `next dev` (no build) → poll `/api/me` for 200/401 (ready in ~23s) →
run flows → `fuser -k PORT/tcp`. `next dev` compiles each route on first hit, so no build is
needed to exercise the API. (b) If dev is OOM-killed, `until ! ps aux | grep -q "next build"; do
sleep 5; done` to wait out sibling builds before retrying. (c) Start the dev server in its OWN
background Bash call and poll it in a SEPARATE call, so an OOM at startup is visible instead of
silently skipping all flows. `✓ Compiled successfully` in a failed build log still proves your
routes transpile (compile-phase proof) even when the build's later FS step dies.

Related: [[feedback-tsc-cache-and-ownership]], [[feedback-verification-trust]].
