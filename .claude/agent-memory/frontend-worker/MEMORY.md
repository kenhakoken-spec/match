# Frontend Worker Memory — matching-app

- [S1 UI Task Context](task_s1_ui.md) — S1 UI implementation task scope, completion criteria, FAIL conditions
- [S2 UI Task Context](task_s2_ui.md) — S2 slots UI (done): contract shapes, owned files, reused primitives, design rules
- [S3 UI Task Context](task_s3_ui.md) — S3 match detail/admin venue+notify/my-app 成立 (done): owned files, frozen contract rules, FALLBACK ids
- [S5 UI Task Context](task_s5_ui.md) — S5 相互評価 U-15 list+detail, StarInput (done): bare-body GET contract, owned files, FALLBACK ids, testids
- [S6 UI Task Context](task_s6_ui.md) — S6 優良バッジ mypage+admin A-10 (done): PremiumBadge already exists, contract shapes, owned files, 5 testids
- [S4 Payment UI Task Context](task_s4_ui.md) — S4 U-14 決済 (done): intent keys slotId, 3 reason branches, testids, §4.7C compliance, tool-I/O lesson
- [S8 Public Preview UI Task Context](task_s8_ui.md) — S8 未ログイン explore (done): real public DTO field names, wrapped {slots}, PII rules, testids, reused primitives
- [S8 3-axis Rating UI](task_s8_rating.md) — S8 3軸評価+来なかった報告 (done): POST 3-axis body, multiAxis/noShow contract, MultiAxisSummary, new testids (axis-again/talk/manner, noshow-report)
- [S8 Release Gate + Coming Soon](task_s8_releasegate.md) — S8 要望3 待機画面+全体ゲート (done): gate on per-entry page NOT layout, fail-open default, server/client split, testid coming-soon
- [S8 Venue Admin + Multi-axis](task_s8_venue_admin.md) — S8 admin 会場候補 (done): venue API shapes (items/{candidate,match}), no scaffold existed, admin roster has NO occupation/3軸 (要望1 already via PublicMemberCard), 313 baseline
- [S9 HAKO-NIWA Rebrand + LP](task_s9_ui.md) — S9 (done): rendez→箱庭 rebrand, BrandMotif inline-SVG, LP, onboarding gender-first+sessionStorage, fee-by-gender (女性に¥2,000非表示), BrowseStatusBanner, new testids
- [S11 Polish: date-cards/calendar/HeroScene](task_s11_ui.md) — S11 #2/#3/#8 (done): SlotDateBlock+AreaChip date-主役, SlotCalendar+ViewToggle, HeroScene SVG(6 silhouettes 3v3), jstDateParts/weekdayColorClass, fee-split preserved, testids view-toggle*/slot-calendar
- [S11 Visual: PC responsive + Hero映え](task_s11_visual.md) — S11 視覚強化 (done): app-shell 480 撤廃(全画面影響), LP md+ 2-col hero(order-swap), explore/browse grid md2/lg3, HeroScene 6-layer rebuild, BottomTabs band-full-width. **モバイル 1px 不変** (widen all md:/lg:). 0 testids added
- [S12 Profile刷新 + 定員柔軟化](task_s12_ui.md) — S12 #1/#6/#7/#8/#10/#14 (done): 写真→ProfileIcon(10 line-SVGs), 職業free-text, 性別 create外し(onboarding由来), 成立詳細にage/職業/bio, 定員2:4許容(fillProgressText/capacityText). **route+zod seam had to be wired** (backend domain/repo ready but route open). testids icon-picker/icon-option-*
- [Env: pkill & dev-server gotchas](feedback_env_wsl.md) — pkill/fuser exit 144 cascades; dev server lifetime; blank Bash output
- [E2E data-testid map](task_e2e_testids.md) — 16 testids for S1/S2 UI: value→element map, no-spread-prop forwarding, git-untracked verify-by-grep
