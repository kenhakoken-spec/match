---
name: project-s10-redesign
description: S10 で LP/オンボを CSS アトモスフィア + ペルソナ/マーケ起点に全面リデザイン。S9 の garden-plot 線画SVG を撤去。仕様の所在と要点。
metadata:
  type: project
---

S10（2026-06-02 殿指示・正典 docs/03_s10_redesign.md）。開発将軍が本番(match-nomi.vercel.app)を実機スクショ確認した上での問題棚卸し→ペルソナ/マーケ起点で LP・オンボ・ビジュアルを全面リデザイン。

実機で確認された"今の問題"（必ず解決）と S10 の対応:
1. **garden-plot.svg（庭の俯瞰線画＝区画+楕円+↑+○6）が意味不明で安っぽい** → **全面撤去**。LP/ComingSoon/オンボの全参照から外し、BrandMotif の MotifName/VIEWBOX/SHAPES と public/brand/garden-plot.svg も削除。ヒーローは **CSS アトモスフィア**(radial-gradient + blur)に置換。意味の通る小モチーフ `leaf`(新規) と既存 lantern/gate/stepping-stones だけ残す。
2. **LoginScreen の `fixed inset-x-0 bottom-0` フッタがヒーロー本文に被る**(pb-44 では足りない) → **固定フッタ廃止**。主CTAをヒーロー内に、末尾にもCTA再掲。構造的に被り消滅。追従バーは任意(本文を隠さない条件・主CTA1個・約68px・半透明・ヒーローCTAがview外の時のみ)。
3. **ビジュアルが弱い・平板** → ヒーロー背景=生成り×テラコッタ(+深緑)の有機グラデ(accent最大0.20透過/緑0.14・blur8〜10px・bg.baseへ透明に抜く)。価値ブロックをカード化。明朝主見出し32px/lh1.3、タグラインは小さく tracking+0.08em。
4. **ログイン外で詰まる/LINEではじめるでエラー** → errorMessage を原因別＋「次の一手」付きに。LINE外案内「スマホのLINEで開くと、そのまま進めます」を主CTA直下に常設。エラーは state/warn(赤にしない)。runLogin/自動再開ロジックは挙動不変で維持。

最重要ビジュアル方針: **「画像っぽいリッチさを外部画像に依存せず CSS で作る」**＝線画の図解(製図)をやめ"空気"を描く。紫グラデは厳禁(design-system §8)。テラコッタ＋深緑の2色のみ・低彩度・blurで溶かす。新カラートークン不要(既存トークンの透過で作る)。globals.css に `.hero-atmosphere`(+`--soft`)ユーティリティ追加。tailwind.config 変更不要。

LP情報設計(縦): ロックアップ → ヒーロー(タグライン+主見出し明朝+サブ見出し"不安に触れる1〜2文"+主従CTA+LINE外案内) → 不安解消の価値4カード(3対3/本人確認/真剣な人だけ罰金/手間ゼロ) → 流れ5 → 具体ブロック(エリア/水金土19:30/人数=実在感) → 末尾CTA再掲 → 規約。価値はS9の5点→S10は不安解消4軸に整理。

S9 で確定した内容(ブランド HAKO-NIWA/箱庭、タグライン「みんなが出会える場所」、料金出し分け=異性側金額非表示、撮影後導線、オンボ性別先頭4ステップ/スキップ不可/「あとで」→/explore、sessionStorage性別一時保持)は **S10 で変更していない**(維持)。

成果物: **docs/design/s10-redesign.md**（1ファイル。問題対応表/CSSビジュアル戦略の具体値/BrandMotif作り直し/LP・ComingSoon・オンボのワイヤーと文言/固定CTA解消/ログインUX/新ユーティリティ/引き継ぎチェックリスト/既存差分表）。

**Why:** 殿「ペルソナ・マーケの観点から最高のプロダクトを目指して改修しきって」。S9実装の garden-plot 線画・固定CTA被り・平板ビジュアル・ログイン詰まりを開発将軍が実機で問題視。
**How to apply:** S10以降の LP/オンボ設計・レビューでは garden-plot を使わない(撤去済)。ヒーロービジュアルは CSS アトモスフィア(テラコッタ+深緑グラデ・紫禁止)。固定フッタCTAに戻さない(被り再発防止)。S9仕様(ブランド/料金/導線/オンボ4ステップ)は維持前提。関連: [[project-s9-brand-hakoniwa]] [[feedback-design-direction]] [[project-product-constraints]]
