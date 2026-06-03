---
name: s12-foundation
description: S12 profile-revamp + capacity-flex backend foundation — what changed and the matched-member DTO contract shift
metadata:
  type: project
---

S12 (docs/05_s12_feedback.md + docs/06_s12_strategy.md) backend foundation, implemented 2026-06-03. vitest went 389→443.

**Schema (Profile)**: added `iconKey String?` (#8 写真→アイコン; presets in [[icons-module]]) and `occupationText String? @db.VarChar(40)` (#6 職業フリー入力). `photoUrl` + enum `occupation` KEPT for backward-compat. **Schema (Slot)**: added `capacityTotal Int @default(6)` / `minPerGender @default(2)` / `maxPerGender @default(4)` (#10). `capacityPerGender @default(3)` kept as per-gender upper bound for strict 3:3.

**#10 flex-capacity rule (the decided spec)**: 成立 = 合計 capacityTotal(6) かつ 各性別 [minPerGender(2), maxPerGender(4)]. So 3:3 / 2:4 / 4:2 = OK; 5:1 / 6:0 / 1:5 / 5人 = NG. New pure fns in domain/match.ts: `isSlotFullFlex`, `canAcceptGenderFlex` (応募ゲート: min は成立条件であって応募可否には使わない＝最初の1人を弾かない), `isValidFlexCapacity`, `DEFAULT_FLEX_CAPACITY`. Existing `isSlotFull` (strict per-gender) left untouched so its 17 tests pass.

**#7/#4/#14 matched-member disclosure — CONTRACT SHIFT**: `MatchMemberDTO` was `{displayName,gender}`; now `{displayName,gender,age,occupation,bio}`. age = calcAge(birthdate) (生年月日そのものは出さない), occupation = resolveOccupationDisplay (occupationText優先→enum日本語化). `MatchMemberRow` (repo type) gained birthdate/occupationText/occupation/bio; `getMatchMembers` now also fetches the profile (was user-only). PII still stripped: NO lineUserId/userId/birthdate. Applies to BOTH user (toMatchDetailDTO) and admin (toAdminMatchDetailDTO).

**#6 occupationText is PII-ish → NOT in public preview**. The public path (toPublicMemberDTO / PublicMemberDTO) still uses ONLY enum `occupation` for the anonymized summary. Free-text occupationText + bio are disclosed ONLY to matched peers. See [[s12-test-contract-gotchas]] for the exact-keys assertions that enforce this.

New domain fn for #6: `sanitizeOccupationText` in domain/profile.ts (trim, collapse whitespace, strip C0/DEL/zero-width via `new RegExp("[\\u0000-\\u001F\\u007F\\u200B-\\u200F\\uFEFF]","g")`, clip to 40 cp, ""→null).
