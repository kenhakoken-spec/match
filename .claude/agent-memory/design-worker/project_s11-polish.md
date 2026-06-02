---
name: project-s11-polish
description: S11 仕上げ設計。会カードを日付主役に反転・リスト/カレンダートグル・LPヒーローに主役級SVGシーン(HeroScene)。仕様の所在と要点。
metadata:
  type: project
---

S11（2026-06-03 殿FB・正典 docs/04_s11_polish.md）。LINEログイン解決済み後の「ゆっくり確実に品質を上げる」仕上げ。design-worker 担当は #2/#3/#8/一貫性の4点（#1本人確認バグ/#4ボタン質感[フェーズ1済]/#5性別コピー/#6本人確認表のみ/#7画面カタログ/#9プロレビュー は対象外）。

設計した3点（成果物 docs/design/s11-polish-design.md・1ファイル）:
1. **#2 日付主役カード**: 現状は area(font-serif 17px ink-900)が主役・日付(13px ink-500 右肩)が従＝逆。殿「いつ開催が一番大事」。→反転。情報階層原則「①いつ②どこ③充足④条件料金」。一覧カード=「日」を数字主役(serif 28 tabular)＋月小前置＋**曜日色**＋時刻、エリアはチップ(従・右上)。詳細ヘッダ(slots/[id]・explore/[id])=h1「{エリア}エリア」廃止し「6月13日(金)」明朝28＋曜日色＋時刻、エリアはチップ。**曜日色=平日ink-700/土state-info(#5B7186青み)/日accent-600(#A85638暖)・原色赤青NG**。FillDots・条件チップ・料金出し分け(女性に¥2000見せない/中立併記)は維持。
2. **#3 カレンダー**: browse/explore両方に「リスト/カレンダー」セグメントトグル(既定リスト・ローカルstate)。月カレンダー1種のみ(週ビューは過剰NG)。7列グリッド・開催日にaccentドット・今日は控えめ強調・選択日は塗り・開催無し日タップ不可。選択日の会を#2カードで直下に縦積み(画面遷移なし)。初期選択=最も近い未来の開催日。新規 SlotCalendar.tsx(renderCardで両画面共有)。新API不要(既存fetchSlots/fetchPublicSlotsをクライアントで日付グルーピング)。
3. **#8 映えるビジュアル(最重要)**: 殿「TOPにちゃんと画像を/映えない」。手段比較で**(a)作り込んだSVGシーンを推奨**((b)CSS幾何=garden-plot二の舞リスク/(c)フリー写真=ライセンス・肖像ズレ・借り物感で不採用)。新規 HeroScene.tsx(viewBox360×280)=空グラデ(accent-100→bg-base)/光の弧(accent-300)/庭の丘2枚(secondary)/石灯籠(灯り=安心)/**6人のシルエット(3対3で向かい合う・顔描かない・ink-700 70-85%逆光)**。塗り＋グラデの1枚絵で「写真っぽい奥行き」、garden-plotの失敗(線だけ・俯瞰製図・解読要求)を全て外す。LPヒーローのロックアップ〜タグライン間に配置・hero-atmosphereは維持。各所の映えは抑制(カードは情報で魅せ装飾足さない/EmptyState glyph→BrandMotif任意)。映えの主役はHeroScene1点に集中。

**新カラートークン追加なし**(曜日色も既存トークン流用)。追加は datetime.ts に jstDateParts/weekdayColorClass、States.tsx の glyph を ReactNode 化(任意)のみ。tailwind.config 変更不要。Buttonはフェーズ1済(影+active:scale)で変更不要。

**Why:** 殿が実機(本番)で会カードのエリア主役・日付従が逆、LPに主役級ビジュアル無し映えない、を問題視。トーン(生成り+テラコッタ・明朝×ゴシック)は良いので維持。
**How to apply:** S11以降のカード設計は日付主役(数字＆明朝＋曜日色)・エリアはチップで従を死守。曜日色は全画面統一(平日/土/日)。映えの主役絵はHeroScene1点のみ(他画面に持ち込まない・線画モチーフBrandMotifと塗り絵を競わせない)。フリー写真は当面不採用。S9/S10仕様(ブランド/料金出し分け/garden-plot撤去/CSSアトモスフィア/固定CTA解消/オンボ)は維持前提。関連: [[project-s10-redesign]] [[project-s9-brand-hakoniwa]] [[feedback-design-direction]] [[project-product-constraints]]
