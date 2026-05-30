# S8 基盤契約（凍結）— schema拡張 ＋ 型 ＋ ドメイン純関数

S8の全機能が依存する**共有基盤**。**この1体だけが schema/types/repo中核/domain を集中編集**する（他S8 workerは基盤完成後に並列着手）。
正典: [`../01_s8_spec.md`](../01_s8_spec.md)。着手前に `prisma/schema.prisma` 全体と `src/lib/types.ts`・`src/lib/repo/types.ts`・`src/lib/repo/memory.ts`・`src/lib/domain/*` を読むこと。

## 0. 鉄則
- 既存の **188テスト・tsc rc0・build** を壊さない（壊したら直す）。
- 既存フィールドは**後方互換**で拡張（削除より追加・任意化）。
- dev/build/curl は将軍が後で。**worker は tsc と vitest のみ**実行可。pkill/fuser打たない。

## 1. schema 拡張（prisma/schema.prisma）
- **Profile**: 追加 `occupation String?`（職種・自由文 or 後述enum）、`scoreAgainAvg Float @default(0)`, `scoreTalkAvg Float @default(0)`, `scoreMannerAvg Float @default(0)`（既存 ratingAvg=総合平均は維持）, `noShowCount Int @default(0)`。
- **Rating**: 単一 `score` を**3軸へ**: `scoreAgain Int`, `scoreTalk Int`, `scoreManner Int`（各1-5）。+ `noShowReport Boolean @default(false)`（この rater が ratee を「来なかった」と報告）。既存 `score` は残して「総合(3軸平均の丸め)」として後方互換にしてもよい（worker判断、テストが通る形で）。
- **Payment**: 追加 `type PaymentKind @default(participation)`（enum `PaymentKind { participation no_show_penalty }`）。penalty は amount=5000。
- **VenueCandidate**（新規 model）: `id, slotId, name, url String?, tabelogScore Float?, googleScore Float?, fitScore Float?(合コン向き度), area Area, status VenueCandidateStatus @default(suggested)`（enum `suggested|chosen|rejected`）。Slot と関連。
- **IdentityVerification**: 追加 `aiVerdict IdentityAiVerdict?`（enum `ok|review|ng`）、`aiReason String?`、`aiCheckedAt DateTime?`。
- enum追加: `PaymentKind`, `VenueCandidateStatus`, `IdentityAiVerdict`。職種をenum化するなら `Occupation`（会社員/経営者/公務員/医療/IT/クリエイティブ/学生/その他 等）も可。null許容。
- **検証**: ローカル v5 で `./node_modules/.bin/prisma validate`（.env のダミーDB URLで）→ "valid"。`./node_modules/.bin/prisma generate` 通す。

## 2. ドメイン純関数（src/lib/domain/ ・vitest必須）
- `src/lib/domain/rating.ts` 拡張: `aggregateMultiAxis(ratings: {scoreAgain,scoreTalk,scoreManner}[]): {again,talk,manner,overall,count}`（空→0）。各軸平均＋総合（3軸全体の平均）。既存 aggregateRatings は互換維持 or overall に委譲。
- `src/lib/domain/noshow.ts`（新規）: `isNoShowConfirmed(reportCount: number, threshold=2): boolean`。境界(1=false,2=true)。
- `src/lib/domain/payment.ts` 拡張: `penaltyAmountJpy(): 5000` 定数/関数。`computeFee` は不変。
- `src/lib/domain/badge.ts`: 総合平均(overall)でのpremium判定に合わせる（ratingAvg=overall を入力にする）。境界テスト維持。
- 各純関数に vitest（正常+境界+異常）。

## 3. 型（src/lib/types.ts）＋ 公開DTO
- 多軸 Rating の共有型、`PaymentKind`、`VenueCandidateDTO`。
- **公開(プレビュー)DTO**（未認証に返す・要望1）:
  - `PublicSlotDTO`: id, datetimeStart, area, capacityPerGender, filled, conditions(minAge/maxAge/requiresBadge), feeMale, status。
  - `PublicMemberDTO`: occupation, ageBand(例 "20代後半"/"30代前半"), ratings{again,talk,manner,overall,count}, hasPremiumBadge。**氏名・displayName・photoUrl・lineUserId・正確な生年月日は含めない**（年代バンドのみ）。
- `src/lib/serializers.ts` に `toPublicSlotDTO` / `toPublicMemberDTO`（PII除去の出口関門）と、生年月日→年代バンド変換 `toAgeBand(birthdate)`。

## 4. repo（src/lib/repo/）
- memory実装を新フィールド・VenueCandidate に対応（既存 in-memory ストアに追加）。prisma実装は型を合わせ実DB未検証コメント。
- seed拡張: **水/金/土 19:30 の枠**を恵比寿/池袋/銀座で複数（誰でもOK枠中心＋20代限定1つ＋優良バッジ限定1つ）。参加者seedに occupation を付与。

## 5. 完了条件（worker自身が実行・実出力を報告）
1. `./node_modules/.bin/prisma validate`（.env）→ valid。`prisma generate` 成功。
2. `rm -f tsconfig.tsbuildinfo && ./node_modules/.bin/tsc --noEmit` → rc0。
3. `npm run test` → 既存188＋S8新規（多軸集計/no-show/penalty/badge総合）が全PASS。実数報告。
4. 変更/新規ファイル一覧、追加schemaフィールド/enum/model、純関数のテスト網羅、後方互換の説明。
【FAIL】既存テスト破壊 / prisma validate失敗 / tsc失敗 / dev・build・curlを起動 / frontend(src/app配下ページ)改変。
【報告】基盤が次の並列worker(API/frontend/Haiku/会場)に渡せる状態か、結線ポイント（プレビューDTO/no-show課金/AI判定フック/会場候補/リリースモード）を明記。
