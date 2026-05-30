---
name: s8-venue-recommend
description: S8 会場候補レコメンド (admin) — venue-service + /api/admin/venues/** routes; auto-suggest hook in finalizeMatchOnApply; vitest 232.
metadata:
  type: project
---

S8 要望2 の会場候補レコメンド (admin) を実装した。飲食店予約は人間(殿)、候補出し+通知を自動化。

実装ファイル (所有):
- `src/lib/venue-service.ts` — 純関数 `computeFitScore` (食べログ正規化*0.5 + Google*0.3 + 席タイプ*0.2, 0..1) と `recommendVenues(area, size, maxResults=3)` (モックカタログ・決定的・6名以上はカウンター除外)。副作用つき `suggestVenuesForSlot` (冪等: 既存候補あれば再生成しない)/`chooseVenueCandidate` (chosen化→repo.matches.setVenue で会場確定, 既存 venue ルートと整合)/`rejectVenueCandidate`/`listVenueCandidatesForSlot`。
- `src/app/api/admin/venues/route.ts` GET ?slotId= (fitScore降順一覧), `suggest/route.ts` POST, `[id]/choose/route.ts` POST, `[id]/reject/route.ts` POST。全て requireAdmin。zod は各 route にローカル定義 (validation.ts は触らない方針)。

非所有で触った唯一の file: `src/lib/match-service.ts` — `finalizeMatchOnApply` 末尾に additive な try/catch で `suggestVenuesForSlot(slotId,"system")` を1ブロック追加 (成立時の自動 suggest 結線)。失敗は成立本体を巻き込まない。

**Why:** 実食べログ/Google API 未接続 → モック recommender。実API差し替えは recommendVenues の中身のみ (fetch→正規化→computeFitScore→sort)、署名不変。運営通知は既存 NotificationType `match_to_admin` を流用 (payload.kind="venue_candidates_ready")。

**How to apply:** 会場候補を触るときはここから。done-route 等と違い VenueCandidate 基盤(model/repo/seed)は完成済 [[s8-foundation]]。私のテストは venue-service.test=24 + venues-route.test=23 = **47 PASS**。

**結線の罠 (重要):** suggestVenuesForSlot の運営通知は当初 `match_to_admin` を流用したが、finalize の既存通知と被って match-service.test の冪等アサート(`listByMatch(id,"match_to_admin")===1`)を壊した。→ 種別を **`reminder`** (payload.kind="venue_candidates_ready") に変更して解決。新 NotificationType を足せない(types.ts/memory.ts 凍結)ので既存 reminder を流用。

最終: whole-tree `rm -f tsconfig.tsbuildinfo && tsc --noEmit` **rc0**, `npm run test` **313 PASS / 21 files**。私の3テスト=49 PASS。

**並列 workerの巻き添えに注意 (2026-05-31):** 作業中に他S8 worker(haiku-verify, noshow-service, rating-service, public/slots, release, identity/route改変)が断続的に **未完成コミット** をツリーに入れ、私の tsc/test 実行ごとに別の fail/error が出ては消えた(haiku-verify-flow.test の getRepo 未importなど)。**全て私のコードと無関係で、最終的に当人達が直し全 PASS に収束**。私のファイルを退避して baseline を取ると同じ sibling fail のみ残り、戻すと差分=私の49だけ増えることを確認済み。私の所有ファイルの whole-tree tsc エラーは常に **0**。所有外が壊れている瞬間の自己検証は `/tmp` の temp tsconfig (私のファイル+依存グラフのみ include, incremental:false, plugins:[]) で rc0 を示す手法 [[tsc-cache-and-ownership]]。Bash が空出力/文字化けに degrade するので1コマンド=1検証。
