---
name: s8-public-preview
description: S8 unauthenticated preview API (public slots list+detail) and RELEASE_MODE helpers — where they live and the PII contract they enforce
metadata:
  type: project
---

S8 要望1 (見えるけどできない preview) + 要望3 (リリースモード) のサーバ実装。基盤(s8-foundation)が公開DTOを用意した上に乗る。

## 実装したもの
- **GET /api/public/slots** (`src/app/api/public/slots/route.ts`): 認証不要。`requireUser` を呼ばない。open枠のみ日時昇順、各行 `toPublicSlotDTO`。一覧は filled 数のみ・members なし。
- **GET /api/public/slots/[id]** (`src/app/api/public/slots/[id]/route.ts`): 認証不要。枠 + 参加者を `PublicSlotDetailDTO`。参加者は `listActiveBySlot`→`profiles.findByUserId`→`badges.hasPremium`→`toPublicMemberDTO`。生 Profile/User は決して返さない。未存在は 404 `jsonError`(http.ts に `HttpError` クラスは無い、throw でなく return jsonError)。
- **RELEASE_MODE**: `releaseMode(): "waiting"|"open"` を `src/lib/env.ts` に追加(評価時点の process.env を読む)。`src/lib/release.ts` に `isWaiting()`/`isOpen()`(`import "server-only"`)。
  - **Why:** 既定 open のフェイルオープン — 設定漏れで本番が待機画面に固まる機会損失を避ける。"waiting" と明示したときだけ waiting。
  - **How to apply:** public API は waiting でもゲートしない(集客)。参照するのは全体UIゲートのみ(待機画面UIは frontend 担当)。

## PII契約 (テストで not.toContain 実証 — public-pii.test.ts)
公開レスポンスに出してはいけない: 氏名/displayName/photoUrl/lineUserId/正確な生年月日/bio/内部id。出してよい: ageBand(年代バンド)/gender/occupation/多軸ratings/hasPremiumBadge。`PublicMemberDTO` の許容キーは厳密にこの5つだけ(Object.keys で固定)。

## 検証メモ
- 214 baseline は無傷(オリジナル12ファイルを束ねて再走 → 214 PASS rc0 で確認)。自分の追加 15(public-pii 10 + release 5)。12baseline+自分2ファイル(自分を最後に並べる)=228 PASS rc0。
- **既知の偽FAIL(自分起因ではない)**: `match-service.test.ts` の「match_to_admin 二重記録なし」が **複数テストファイルを特定順で同居実行したとき** flaky に落ちる。原因は in-memory store が `globalThis.__mappStore` 共有で、先行ファイルが残した状態を拾うため(順序依存)。`match-service.test.ts` 単体は5/5 PASS、自分のファイルを後ろに並べれば再現しない。自分は match-service の依存(match-service.ts/memory.ts/notify)を一切触っていない(これらは foundation/兄弟worker の変更)。**自分のゲート判定は「自分の2ファイル」+「オリジナル12 baseline」で行う**こと。
- repo は **サブオブジェクト経由**: `repo.slots.list/findById`, `repo.applications.countActiveByGender/listActiveBySlot`, `repo.profiles.findByUserId`, `repo.badges.hasPremium`。flat な listSlots 等は無い(最初それで間違えた)。
- `toPublicMemberDTO(profile, hasPremiumBadge, now?)` — ratings は profile の `*Avg` キャッシュから(引数で渡さない)。`toPublicSlotDTO(slot, counts: GenderCounts)`。
