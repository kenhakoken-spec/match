---
name: s12-flex-apply-wiring
description: S12 #10 flex-capacity wired into the real apply path (both repos + eligibility); how the two applyAtomic stay identical
metadata:
  type: project
---

S12 #10 (定員柔軟化 2:4〜4:2) was a pure-fn-only feature until 2026-06-04: `applyAtomic` and `genderFull` still used strict 3:3, so the server rejected 2:4 while the UI advertised it (security-reviewer SEC-001). Now wired into the real path.

**The decided spec (unchanged):** 成立 = 合計 capacityTotal(6) かつ 各性別∈[min(2),max(4)]. 3:3/2:4/4:2=OK; 5:1/6:0=NG. 応募ゲート = `canAcceptGenderFlex` (mine>max OR total>capacityTotal → reject); **min is NOT an apply gate** (don't reject the first person).

**memory↔prisma identical-behavior guarantee:** both `applyAtomic` impls call the SAME three pure fns from `src/lib/domain/match.ts`:
- `flexCapacityFromSlot(slot)` — single source for slot→FlexCapacity (null/undefined → DEFAULT_FLEX_CAPACITY fields). Use this everywhere instead of re-deriving cap, or in-memory/DB will drift again.
- `canAcceptGenderFlex(counts, gender, cap)` — the reject gate (`if (!canAccept…) return gender_full`).
- `isFullByCountsFlex(after, cap)` — NEW count-based matched判定. Needed because applyAtomic only has after-counts, not the applications array. `isSlotFullFlex(array)` now delegates to it, so array/count/in-memory/DB all share one criterion.

The 2nd applyAtomic arg `capacityPerGender` is now `_capacityPerGender` (kept for the ApplicationsRepo interface contract, NOT used for decisions — cap comes from the slot).

**eligibility:** `genderFull` signature changed from `(filled, capacityPerGender:number, gender)` to `(filled, cap:FlexCapacity, gender)` = the negation of `canAcceptGenderFlex`. `EligibilitySlot` gained optional `capacityTotal/minPerGender/maxPerGender` (capacityPerGender kept). `slot-service.ts` now passes those through. Consequence callers/tests must know: **3 same-gender is NO LONGER full** (max=4); full triggers at mine=max(4) OR total=6.

**Proof:** `src/lib/repo/apply-atomic-flex.test.ts` is the real-path integration test (uses `new MemoryRepo()` + `__resetMemoryStore`, NOT getRepo — see [[repo-singleton-vitest]]). Asserts 4th same-gender accepted / 5th rejected / 2:4·4:2·3:3 matched=true (the SEC-001 core) / Slot→filled on match / 5:1·6:0 structurally unreachable.

vitest baseline is now **466 passed** (was 443). tsc 0 (rm tsconfig.tsbuildinfo first — see [[tsc-cache-and-ownership]]). prisma schema unchanged (flex fields already existed from [[s12-foundation]]).
