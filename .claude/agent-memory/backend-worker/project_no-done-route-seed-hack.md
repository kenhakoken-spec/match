---
name: no-done-route-seed-hack
description: matching-app has no route that sets Slot.status="done"; S5 rating E2E seeds a done slot by writing into the shared in-memory global from a worker-owned file
metadata:
  type: project
---

As of S5 (2026-05-30), **nothing in `src/app/**` ever sets a Slot to `status="done"`** — only
`canceled` is set (admin slot cancel route). `done` exists in the enum/SlotStatus but no admin
"close event / mark done" endpoint had been built yet. So an evaluation/rating flow that requires
a `done` slot cannot be reached through normal API calls.

**Why:** S5 (相互評価) evaluates the co-members of a `done` event, but the lifecycle step that
produces `done` is a later sprint. The S5 contract still required a curl E2E proving the rating
flow, and explicitly said the worker may seed "done 済イベント＋同席6名" inside rating-repo
(memory.ts is off-limits per the parallel-implementation rule).

**How to apply:** The seed technique that worked: `MemoryRepo` reads its store from
`globalThis.__mappStore` (and exposes `__resetMemoryStore`). A worker-owned file can add data to
that SAME global handle WITHOUT editing memory.ts — declare a minimal local `interface` matching
the subset of the `Store` shape you touch (users/profiles/slots/applications), call `getRepo()`
first to guarantee the store is initialized+seeded, then write a `done` slot + 6 `accepted`
applications idempotently. Expose it via a **mock-only** HTTP trigger under your owned path
(`POST /api/ratings/_dev-seed`, 404 when `isMockAuthEnabled()` is false) so the running dev server
(separate process from the test) can populate ITS own global before the curl flow. Gotcha that
makes login line up: `dev-login` upserts by `lineUserId` via a scan, so seed your test users with
the exact `lineUserId` you will log in with (e.g. `Urate_rate-m1`) — then dev-login returns the
seeded user id (`rate-m1`) instead of minting a new cuid, so `isAcceptedParticipant` matches.
Re-check whether a real `done`-setting admin route exists before reusing this — once it lands,
prefer driving `done` through the API. See [[feedback-tsc-cache-and-ownership]] (ownership) and
[[feedback-verification-trust]] (curl E2E recipe).

**Curl-script gotcha that cost a full cycle (2026-05-30):** running `next dev &` nested inside a
`bash one.sh` under `set -u` produced a dead server whose log file stayed 0 bytes, and the poll
falsely reported "up after 1s" because the break condition compared curl's failure output wrong
(`code=$(curl -w %{http_code} ... || echo 000)` yields `000000` on connection-refused, and
`"000000" != "000"` is true → false positive). What actually worked: start the dev server with the
**Bash tool's own `run_in_background:true`** (`exec npx next dev -p 3405 > /tmp/log 2>&1`), then in a
SEPARATE foreground call poll with an explicit success set (`[ "$CODE" = "200" ] || [ "$CODE" = "401" ]`,
sleep 2, up to ~120s — WSL cold start measured 25s). Run curl flows in further foreground calls, then
teardown with `fuser -k 3405/tcp` (which also ends the background task — expected). 401 on `/api/me`
is the correct "server is up, just unauthenticated" signal to poll for.
