import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// 単体テスト（純関数: 成立判定 / 応募ゲート / 評価集計 / バッジ判定 等）。
// 既定は node 環境。コンポーネントテストを足す場合は worker 側で jsdom を追加する。
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
