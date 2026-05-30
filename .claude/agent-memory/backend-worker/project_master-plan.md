---
name: project-master-plan
description: matching-app product scope and the source-of-truth doc, including the 2026-05-30 expansion
metadata:
  type: project
---

`docs/00_master_plan.md` is the single source of truth ("正典") for matching-app. Read it before any backend work.

Product: 合コン型グループマッチング on LINE (LIFF) — 男女3対3=6人, **チャット無し**, 会場は運営が手動手配し店名/予約URL/予約名を6人へLINE通知. 規模〜1千人. Stack: Next.js (App Router) + Vercel + Prisma + Vercel Postgres (Neon).

**Why this matters:** On 2026-05-30 the plan was significantly expanded from the original "MVP全員無料/決済後付け" version. The current confirmed requirements are:
- **本人認証=必須** (公的身分証アップロード→運営目視審査→承認). Gates 枠応募 (未認証は応募不可). Doubles as 年齢確認(18+).身分証画像は承認後に削除 (PII最小保持).
- **決済=Stripe・従量** (MVPコア, not後付け). 男性=1回¥2,000, **初回参加は無料**, **女性は常に無料**, **不成立時は課金しない**. カード情報は自前保持しない.
- **評価=相互評価** (イベント後), Profile に ratingAvg/ratingCount 集計.
- **優良バッジ(premium)** = 高評価×複数回参加で付与.
- **限定イベント** = Slot に minAge/maxAge/requiresBadge の参加条件.
- **セキュリティ最優先**: PII最小権限・暗号化・最小保持, IDOR対策, security-reviewer必須.

**How to apply:** Any backend design/impl must reflect these. The earlier "payment is post-MVP" framing is obsolete — payment is S4 core. If a doc still says "決済は後付け" treat it as stale unless it explicitly refers to *future* extensions beyond the Stripe従量 core.

Related: [[project-schema-validation]].
