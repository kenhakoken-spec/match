---
name: s11-visual-upgrade
description: S11視覚強化(PC最適化レスポンシブ＋Hero映え強化)の設計。app-shell 480px解放・LP/explore/browse をmd+で広げる・HeroScene 6層化。仕様= docs/design/s11-visual-upgrade.md
metadata:
  type: project
---

S11 残りの視覚強化を設計（殿FB #8「もっと画像を入れて映えさせる」＋PC共有時の見栄え）。仕様 = docs/design/s11-visual-upgrade.md。

**直す対象（開発将軍が本番で確認）**:
- PC(1280px)で全ページ幅420px相当の1カラム中央寄せ＝未完成見え。原因は globals.css `.app-shell{max-width:480px}` が layout.tsx で全画面適用。
- LP の HeroScene が淡くコントラスト弱く映え不足。raster画像0枚。殿は「もっと画像を入れて映えさせて」と強く要望。

**設計の要点**:
- **PC最適化**: `.app-shell` の 480px を撤廃→`width:100%` に降格。各画面が自前で max-w を持つ二段構え。広げる=LP/explore/browse(md:3xl/lg:5xl)、480px維持=詳細/オンボ/フォーム/mypage 等(`shell-narrow`)。**base(〜767px)は1pxも変えない**(widenは全て md:/lg: prefix)。詳細・フォームを広げない理由=意思決定/入力は読み物幅が最適。admin は対象外・触らない(app-shell撤廃後も現行で動く)。
- **LP**: md+ で 2カラムヒーロー(左コピー+CTA / 右 大きいHero)。DOM維持しmd+で order入替。ValueList md+ 2列(2×2)。
- **explore/browse**: リスト ul を grid(md2/lg3)。固定CTA/BottomTabs の中身は中央 max-w で抑える(帯は全幅)。
- **Hero映え強化(最重要)**: 推奨=(a)SVG作り込み強化＋(b)極小CSS額装。**raster不採用**(ライセンス継続管理/肖像ズレ/AIっぽさ衝突/配信CLS/将来差替の逃げ道は確保)。HeroScene を viewBox 360×280→**360×300・preserveAspectRatio meet**、4層→**6層**(空4stop/沈む陽=主光源強化/遠景稜線 secondary 0.12/庭の丘コントラスト増/前景の敷石・低木/人影コントラスト=手前ink-900 88%・奥70%＆手前2人を大＆足元接地)。色は全て既存トークン・紫青原色なし・フラットSaaS/3D/クリップアート/写真借り物感なし。vignette は inset shadow ink-900 6%まで・グレイン4%まで・アニメ無し。
- **新トークン追加なし**(既存§7で完結)。tailwind.config 変更不要(既定 md768/lg1024)。

関連: [[s11-polish]]（日付主役カード・カレンダー・HeroScene初版）/ [[s10-redesign]]（CSSアトモスフィア・LP情報設計）/ [[design-direction]]（紫青NG・煽らない・編集的）。
