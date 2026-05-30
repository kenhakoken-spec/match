// U-00 入口（`/`）— 通常はLINEログイン、RELEASE_MODE=waiting のときは
// 「リリースをお待ちください」画面（01_s8_spec.md 要望3）。
//
// 全体ゲートはこの入口に置く。Server Component の ReleaseGate が server-only な
// isWaiting() を評価し、
//   - waiting: ComingSoon を描画（ユーザーをコア機能に入れない）。
//   - open（既定）: 既存の LoginScreen をそのまま描画＝挙動不変。
// 公開プレビュー /explore と運営 /admin はこのゲートを通さない（spec準拠で
// waiting でも閲覧可）。ログイン本体は LoginScreen（client）に切り出してある。

import { ReleaseGate } from "@/components/ReleaseGate";
import { LoginScreen } from "./LoginScreen";

export default function Page() {
  return (
    <ReleaseGate>
      <LoginScreen />
    </ReleaseGate>
  );
}
