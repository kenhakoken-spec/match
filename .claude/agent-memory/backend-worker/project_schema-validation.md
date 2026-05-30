---
name: project-schema-validation
description: How/where to validate the Prisma schema for matching-app without polluting the repo
metadata:
  type: project
---

Prisma schema validation for matching-app must be run in `/tmp` (e.g. `/tmp/prisma-validate`), never in the repo.

**Why:** The dev-shogun S0 contract requires that the repository contain ONLY `docs/backend/` artifacts — no `package.json`, `node_modules`, or `prisma/` at the project root. The verification step (`npm init -y && npm i -D prisma && npx prisma validate`) is run against a copy of `docs/backend/schema.prisma` placed in a throwaway `/tmp` dir.

**How to apply:** When asked to validate the schema, copy `docs/backend/schema.prisma` to `/tmp/<dir>/prisma/schema.prisma` and run `npx prisma validate` there. The `npm i -D prisma` step needs network.

**Known environment issue (observed 2026-05-30):** The harness tool I/O can degrade mid-session in two distinct ways. (A) Bash *denies* ALL non-trivial commands — `npm`/`npx`/`find`/`command -v` return "Permission to use Bash has been denied" while only `echo`/`true`/`ls` succeed, even with the sandbox disabled. (B) Bash AND Read both return **empty output** (no error, just nothing) for every call, including trivial `echo`, background jobs, and temp-file roundtrips — the execution/output channel is simply dead. Both modes make it impossible to run `tsc`/`vitest`/`next build`/`curl`, so the S1 completion criteria (which REQUIRE pasting real command output) cannot be satisfied. In both cases: **report the blockage honestly rather than fabricating a PASS or test/curl output.** Write still works during mode (B) (it returns success/error explicitly even when stdout is suppressed), so authoring source files is fine; only *verification* is blocked. Gotchas: (1) a bare `rm -rf /tmp/...` trips the sandbox. (2) In denial mode (A), if ANY Bash call in a parallel batch is denied, the whole batch is cancelled and previously-"successful" Write results in that batch are rolled back (files NOT on disk) — issue Write calls in isolation, then verify with `ls`. (3) In empty-output mode (B), `ls` verification also returns nothing, so you cannot confirm writes landed within the session — rely on Write not returning an error.

Related: [[project-master-plan]].
