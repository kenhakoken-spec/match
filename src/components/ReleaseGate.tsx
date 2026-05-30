import "server-only";

// ReleaseGate — 全体リリースゲート（01_s8_spec.md 要望3）。
//
// RELEASE_MODE=waiting のとき、通常のユーザー入口（U-00 `/` やコア機能）を
// 「リリースをお待ちください」画面で覆う。既定は open（env 未設定/その他）なので
// 通常時はこのゲートは素通りし、ラップした子をそのまま描画する＝挙動不変。
//
// 重要（spec準拠）:
//   - 公開プレビュー `/explore`（src/app/(public)/**）と運営 `/admin/**` は
//     waiting でも閲覧可。集客（見せて登録を促す）と運営のため、それらの
//     ルートはこのゲートを通さない。ゲートを適用するのは個別の入口ページのみ。
//   - 判定の単一ソースは server-only な `@/lib/release` の isWaiting()。
//     （RELEASE_MODE env をフェイルオープンで読む。明示 "waiting" のときだけ true。）
//
// このコンポーネントは Server Component。client 子（U-00 ログイン等）を
// そのまま children として受け取り、open のときだけ素通しで描画する。
// （client から server-only な isWaiting() は呼べないため、判定は必ずここ＝
//  サーバ側で行い、結果に応じて出し分ける。）

import { isWaiting } from "@/lib/release";
import { ComingSoon } from "@/components/ComingSoon";

/**
 * 通常のユーザー入口をラップするゲート。
 * - waiting: リリース待ち画面（ComingSoon）を描画。
 * - open（既定）: children をそのまま描画（挙動不変）。
 */
export function ReleaseGate({ children }: { children: React.ReactNode }) {
  if (isWaiting()) {
    return <ComingSoon />;
  }
  return <>{children}</>;
}
