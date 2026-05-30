---
name: backend-scope-tsconfig
description: How to prove MY backend files are rc0 when sibling parallel workers' in-flight files break the global tsc/test run
metadata:
  type: feedback
---

When parallel S8 workers are mid-refactor, the GLOBAL `tsc --noEmit` and `vitest run` go red from THEIR files (e.g. rating-service/rating-types dropped exports, notify-mock changed signature, identity/route + haiku-verify + venues route + ratings/route not yet updated). Do not conclude my work failed.

**Why:** S8 has multiple workers editing in parallel on the same tree. A foreign broken file fails the whole build, masking whether my files are clean.

**How to apply:**
1. Write a TEMP `tsconfig.backend-check.json` that `extends ./tsconfig.json` and `exclude`s ONLY the foreign in-flight files (verify each excluded path is not mine). Run `rm -f tsconfig.tsbuildinfo && ./node_modules/.bin/tsc --noEmit -p tsconfig.backend-check.json` → expect rc0. Delete the temp tsconfig after.
2. For tests, run vitest scoped to my own test files (`npm run test -- <my test paths>`), AND separately re-run the known baseline file list to prove no regression in shared files. Attribute remaining global failures to their owners by filename.
3. Always `rm -f tsconfig.backend-check.json tsconfig.tsbuildinfo` before reporting so I leave no stray config. See [[tsc-cache-and-ownership]] (same spirit: per-file ownership proof when the shared build is WIP-broken).
