---
name: s12-test-contract-gotchas
description: Exact-keys test assertions and a prisma-validate env-conflict gotcha that bite when changing DTOs
metadata:
  type: feedback
---

Two member-DTO tests do **strict exact-keys** checks (`Object.keys(x).sort()`), so adding a field to either DTO BREAKS them — by design (PII guard). Know which is which before editing a serializer.

- `src/app/api/matches/matches-route.test.ts` asserts the **user matched-detail** member keys. For S12 #14 this was the intended contract change → I updated it to `["age","bio","displayName","gender","occupation"]`. Updating it was correct ("壊したら直す").
- `src/app/api/public/__tests__/public-pii.test.ts` asserts the **public preview** member keys = `["ageBand","gender","occupation","ratings","hasPremiumBadge"]`. This must NOT change — it's the PII firewall. So free-text occupationText/bio must never enter the public path.

**Why:** these assertions are the test-encoded PII contract. A reviewer/test will catch a leak the moment a new field shows up in the wrong DTO. When adding profile fields, decide explicitly: matched-only (extend MatchMemberDTO + update matches-route.test) vs public-safe (extend PublicMemberDTO + update public-pii.test). Most personal fields are matched-only.

**How to apply:** after extending a shared DTO, grep tests for `Object.keys(` exact-key asserts on that DTO before running the suite; update only the intended one. Also strengthen public-pii.test by adding the new field's value as a PII needle (I added "自由入力" to prove occupationText doesn't leak).

**prisma validate env gotcha:** running `./node_modules/.bin/prisma validate` from the **project dir** with a `--schema /tmp/...` path makes Prisma load BOTH the project `.env` and the /tmp `.env` → "conflict between env vars" error (not a schema error). Fix: `cd /tmp/<dir> && prisma validate --schema ./schema.prisma` so only the /tmp `.env` loads. Also the /tmp `.env` copied from the project may be missing `POSTGRES_URL_NON_POOLING` (schema's directUrl) → P1012 "Environment variable not found"; append a dummy directUrl. Validate-in-/tmp is still the rule (see [[project_schema-validation]]).
