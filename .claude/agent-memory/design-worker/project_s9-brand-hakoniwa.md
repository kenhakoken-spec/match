---
name: project-s9-brand-hakoniwa
description: S9 でブランドが rendez → HAKO-NIWA（箱庭）に刷新。タグライン「みんなが出会える場所」。LP/オンボ/料金出し分けの設計仕様の所在。
metadata:
  type: project
---

S9（2026-06-01 殿指示・正典 docs/02_s9_spec.md）でブランド刷新＋作り込み仕上げ。

- **名称: `HAKO-NIWA`（主・英字ロゴ）/「箱庭」（副・和文）**。旧 `rendez` は全置換・残存ゼロが完了条件。
- **タグライン: 「みんなが出会える場所」**（句点なし固定）。
- 比喩: 箱庭＝小さく安心できる手入れの行き届いた庭、人が集い自然に出会う。コンセプトは「合コン」一点突破から「安心できる場で人と出会う」に少し上位化（ただし主機能は男女3対3＝6人で会う、不変）。「合コン」は主見出し禁止・説明補助のみ。
- **画像ゼロ対策（殿の不満＝画像欠落で謎文言）**: `public/brand/` に最小SVG（mark/garden-plot/lantern/gate/stepping-stones、線画currentColor・aria-hidden）。ヒーロー添景は写真が無ければSVGにフォールバックする構造。現行の `◇` プレースホルダはロゴ位置とオンボ空箱で置換（EmptyStateの◇は残してよい）。
- **オンボ**: 先頭に「性別スライド」挿入で4ステップ化（スキップ不可・選択時のみ活性）。料金が性別で変わるため性別を最初に取る。性別値は一時保持→Profile.gender に収束。
- **料金出し分け（殿要件: 異性側に金額を見せない）**: 女性に¥2,000を出さない（料金行非表示or「無料」）/ 男性は¥2,000+初回無料 / 未ログイン・explore は中立併記「男性¥2,000・女性無料」。現行の要修正点= PublicSlotCard（女性無料が欠落→中立併記に）/ SlotCard（常時男性料金表示→viewer genderで出し分け）。PaymentNoticeは既に出し分け済みで流用。
- **撮影後導線（殿の不満: 撮影後しか枠が見えない/予約できるか不明）**: /explore は未認証でも見える事実を各画面で明示。identity/status pending に「審査中でも会は見られます」+「会を見てみる」。承認+プロフ完了後に一度だけ「ホームの会から応募できます」。ユーザー語彙は「応募」統一（「予約」は会場のみ）。

成果物: **docs/design/s9-hakoniwa-brand-and-lp.md**（1ファイル。ブランド/SVG/LP/オンボ/料金表/導線/文言ガイド/引き継ぎチェックリスト/既存差分表）。design-system.md・wireframes.md と矛盾しない差分仕様。

**Why:** 殿が rendez のブランド弱さ・画像欠落の謎文言・性別未確定での料金UI・撮影後の迷子を問題視。S9 で恒久対策。
**How to apply:** S9以降の設計・レビューでは名称は HAKO-NIWA/箱庭（rendez は使わない）。料金UIは異性側金額非表示を死守。画像前提の設計をしない（SVGフォールバック）。関連: [[project-product-constraints]] [[feedback-design-direction]]
