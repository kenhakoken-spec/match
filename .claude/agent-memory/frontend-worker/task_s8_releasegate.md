---
name: task-s8-releasegate
description: S8 要望3 リリース待ち画面 + 全体ゲート (done) — owned files, gate placement (per-entry not layout), fail-open default, testid
metadata:
  type: project
---

S8 要望3 = 「リリースをお待ちください」画面 + 全体ゲート. Done. tsc rc0, 313 tests pass (unchanged — purely additive frontend, no test files touched).

**Owned files (all new except page.tsx refactor):**
- `src/components/ComingSoon.tsx` — 待機画面本体 (presentational, NO hooks → usable as Server Component). data-testid="coming-soon". Editorial tone: ◇ mark, serif h1 「近日、はじまります。」, 3対3 概要 dl (会い方/エリア/公開), 通知希望は「準備中」の静かなプレースホルダ (動かない=誠実). No emoji, no purple/gradient.
- `src/components/ReleaseGate.tsx` — `import "server-only"`. `ReleaseGate({children})`: if `isWaiting()` → `<ComingSoon/>` else `<>{children}</>`. Single source of truth = `@/lib/release` isWaiting() (backend-owned, reads RELEASE_MODE env, fail-OPEN default).
- `src/app/coming-soon/page.tsx` — `/coming-soon` always shows ComingSoon (landing + gate redirect target both). Has metadata.
- `src/app/LoginScreen.tsx` — the OLD page.tsx body extracted verbatim (still `"use client"`, default→named `LoginScreen`). Behavior unchanged.
- `src/app/page.tsx` (refactored, was the only tracked file I edited) — now a thin Server Component: `<ReleaseGate><LoginScreen/></ReleaseGate>`.

**Gate placement decision (IMPORTANT):** gate goes on the PER-ENTRY page (`/` page.tsx), NOT root layout.tsx. Reason: spec requires `/explore` (public preview, src/app/(public)/**) and `/admin/**` to stay viewable even when waiting (集客 + 運営). Wrapping in root layout would blanket-block them. So I left layout.tsx untouched and only gated the U-00 entry. (If core feature entries like (tabs) ever need gating too, wrap each of THOSE pages — never the shared layout.)

**Why client/server split:** `@/lib/release` is `server-only`; a `"use client"` component cannot call isWaiting(). So the decision MUST be made server-side. Pattern: keep the client screen as a child, branch in a Server Component parent. ComingSoon itself is intentionally hook-free so the same component renders from both the gate and the /coming-soon page.

**Fail-open / behavior-unchanged proof:** `releaseMode()` returns "waiting" only when `RELEASE_MODE==="waiting"`; anything else (unset/typo/"open") → "open" → isWaiting() false → ReleaseGate passes children through → identical to pre-change render. So default deployments are byte-for-byte unchanged at `/`.

**Reused tokens/primitives:** `Button` (ui/Button.tsx, spreads ...rest so data-testid forwards). Tailwind tokens only: bg-base/surface/sunken, ink-900/700/500/300, line-200/100, accent-500, rounded-sm/md. Geometric glyph ◇ allowed (not emoji). See [[task-s8-ui]] for the broader S8 frontend (explore preview) and primitive notes.

**Env gotcha confirmed again:** parallel batch had MANY duplicate Read calls return "Wasted call" + blank/garbled Bash output, exactly per [[feedback-env-wsl]]. Writes/tsc/test all succeeded though. Run tsc as `rm -f tsconfig.tsbuildinfo && ./node_modules/.bin/tsc --noEmit` from repo root — rc0.
