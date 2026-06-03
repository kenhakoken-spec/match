---
name: s12-review
description: S12 (profile revamp + flex capacity + LP) security review verdict — 2026-06-04, CRIT0/HIGH0
metadata:
  type: project
---

S12 review (commits 49f96ed プロフ刷新/定員, a07e277 LPコピー) — 2026-06-04. Verdict CRITICAL 0 / HIGH 0 / MED 1 / LOW 3.

**Why:** CLAUDE.md mandates security review after any profile change. S12 expanded PII disclosure (age/occupation/bio to matched peers) per 殿 FB #4/#7/#14.

**How to apply:** Treat these as VERIFIED-GOOD baselines on re-review; only re-check if the named files change.

PII boundary VERDICT = OK (technically enforced):
- `toMatchMemberDTO` (serializers.ts) outputs exactly displayName/gender/age/occupation/bio. No userId/lineUserId/birthdate. age = calcAge integer, raw birthdate stripped at DTO seam. getMatchMembers (match-service.ts) never fetches lineUserId.
- IDOR-safe: api/matches/[id]/route.ts calls isMatchParticipant(slotId, me.id) → 404 for non-participants (session sub, not URL id).
- Public exit toPublicMemberDTO returns ageBand/gender/occupation(enum)/ratings/badge only — NO occupationText/bio/iconKey/exact age. Guarded by public-pii.test.ts ("自由入力" in forbidden tokens).
- iconKey validated server-side by isValidIconKey allow-list (10 ids) in profileSchema; occupationText sanitized at save by sanitizeOccupationText (control + zero-width strip, 40 cap). requireAdmin unchanged on admin routes. profile PUT uses session userId (no IDOR).

OPEN ITEM (SEC-001, MEDIUM, safe-side): flex capacity fns (canAcceptGenderFlex/isSlotFullFlex/isValidFlexCapacity in domain/match.ts) are NOT wired into applyAtomic — apply gate + match still use legacy capacityPerGender=3. So 2:4 flex match does NOT actually occur; no over-fill hole created (existing strict 3:3 gate holds). createSlotSchema has no flex fields and admin/slots route doesn't pass capacityTotal/min/max (repo defaults 6/2/4). When flex is completed later: wire applyAtomic through these fns AND add server-side min*2<=total<=max*2 to createSlotSchema (don't trust client admin/slots/page.tsx hardcoded 6/2/4).

LP diff a07e277 = pure JSX text literals, no href/dangerouslySetInnerHTML/URL — no XSS.

Related: [[known-scaffold-vulns]] [[s8-review]]
