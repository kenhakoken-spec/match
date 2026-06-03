---
name: task-f4-copydeck
description: F4 copy-deck application (done) — 写真詐欺撤去 / 男女あわせて6名 / 前日夜会場 / 料金中立 / 評価=翌日夜 — files touched, what was left as code-intent comments
metadata:
  type: project
---

# F4 コピーデッキ反映 (DONE 2026-06-04)

design-worker が確定したコピー置換マップをそのまま適用。コピーは確定済 = 反映と整合のみ。design-system §8 トーン維持(煽らない・感嘆符なし)。

## Scope rule that shaped everything
ユーザー可視文字列のみ置換。**コメント行(`//`, `{/* */}`, JSDoc `/** */`)のコード意図説明は置換しない**。terms/privacy 法務本文は触らない。
- 結果: 「写真詐欺」可視0(残3件は全てコメント: LpSections:34 persona軸メモ / ProfileIcon:3 + icons.ts:5 「顔写真詐欺の土俵に乗らない」= S12 method説明)。
- 「3対3/3人ずつ/計6人/男女3」可視0(残はHeroScene SVGコメント・ProfileForm gender根拠コメント・lib/domain/match 定員ロジックコメント=全てコード意図)。

## Files touched (visible strings only, NO className/token changes)
- **LoginScreen.tsx**: h1 `3対3で、会いにいく。`→`会って、はじまる。`; subcopy→`男女あわせて6名、はじめましての席。やり取りは要りません。本人確認を済ませた人と、会うことに集中できます。会場の手配までおまかせで。`(#9 写真詐欺撤去/会うことに集中)
- **LpSections.tsx**: LP_VALUES[0].title `3対3だから`→`グループだから、気まずくない`; [1].body 末尾`公的身分証で年齢まで確認`; [3].body 末尾追記`会うことだけ考えてください。`; LP_STEPS[4] `6人で成立 → 会場をご連絡`→`成立したら、前日の夜に会場をご連絡`(#5前日夜); ConcreteBlock FactRow `人数:男女3人ずつ・計6人`→`定員:男女あわせて6名（各2〜4名）`(#10) + **新規2行**(既存FactRow再利用) `会場:…前日の夜にお知らせします。`(#5) + `参加費:参加が決まったときだけ。女性は無料です。（飲食代は別）`(料金中立#2/#3)
- **onboarding/page.tsx**: SLIDES[0].title `男女3対3で会う。`→`男女あわせて6名で会う。`(#9); GenderStep body `男女3人ずつで会うため`→`男女のバランスを保つため`
- **layout.tsx / coming-soon/page.tsx / ComingSoon.tsx**(×2: hero card + 会い方dd): metadata/可視 `男女3人ずつ(・計6人)`→`男女あわせて6名`系で統一
- **HeroScene.tsx**: aria-label のみ `男女3人ずつ`→`男女あわせて6名`(読み上げ整合)。**SVGグラフィック(6シルエット)は触らない**(文言のみスコープ)。
- **ratings/page.tsx** lead + **ratings/[slotId]/page.tsx** caption先頭: #16 期限文言`会のあと、翌日の夜までに同席した方への評価をお願いします。…相手には個別に開示されません。`(既存の任意/個別非開示文に翌日夜deadlineを統合・置換)

## Verify result
tsc 0 error TS (RC=0) / vitest 443 passed 30 files (RC=0, baseline維持・どのテストもこれらコピー文字列をassertしない)。新testid 0(E2E testid map [[task-e2e-testids]] 不変)。新Tailwindトークン不使用(text内容のみ編集)。
