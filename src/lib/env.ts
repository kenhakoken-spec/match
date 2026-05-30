// =============================================================================
// matching-app — 環境変数の集約アクセス & モック判定の単一ソース (SEC-001)
//
// セキュリティ方針(フェイルクローズ):
//   本番(NODE_ENV==="production")では MOCK_* 環境変数の値に関わらず
//   モックを **常に無効** にする。本番 env の設定漏れで mock 認証(=admin
//   なりすまし)や mock DB/通知に落ちる「フェイルオープン」を物理的に塞ぐ。
//   非production(開発/テスト)では開発体験を壊さないため既定 ON。ただし判定は
//   暗黙の `!== "0"` ではなく「明示的に無効化できる」形にする(`MOCK_*=0` で OFF)。
//
//   旧実装は各所(line-mock.isMockAuth / session.getKey / repo / notify)が
//   バラバラに `process.env.X !== "0"`(未設定でも ON)を持ち、本番でも未設定なら
//   mock に落ちるフェイルオープンだった。判定を本モジュールへ集約して統一する。
//
// 秘密値はコードに固定しない(env 経由)。本ファイルは値の読み出しのみ。
// =============================================================================

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProd = nodeEnv === "production";

/**
 * モックフラグの統一判定(フェイルクローズ)。
 * - 本番: 常に false(環境変数の値を無視)。
 * - 非production: 既定 ON。`MOCK_*=0` を明示したときだけ OFF。
 *   (将来「非productionでも明示 ON のときだけ」に締めたい場合は
 *    `value === "1"` 判定へ切り替えるが、現状の開発フローは既定 ON 前提のため
 *    "0 で明示無効" を採用。本番無効化が主目的なので開発側は緩める。)
 */
function mockFlag(value: string | undefined): boolean {
  if (isProd) return false; // フェイルクローズ: 本番は MOCK_* を無視して常に無効
  return value !== "0"; // 非productionは既定 ON / "0" で明示 OFF
}

export const env = {
  nodeEnv,
  isProd,
  // LINE 実チャネル未着の間は LIFF/ログインをモックする(本番では常に無効)
  mockAuth: mockFlag(process.env.MOCK_AUTH),
  // 実 DB 未接続の間は in-memory リポジトリを使う(本番では常に無効=実DB)
  mockDb: mockFlag(process.env.MOCK_DB),
  // LINE Messaging API 未着の間は通知送信をログのみにする(本番では常に無効=実送信)
  mockNotify: mockFlag(process.env.MOCK_NOTIFY),
  liffId: process.env.NEXT_PUBLIC_LIFF_ID ?? "",
  lineLoginChannelId: process.env.LINE_LOGIN_CHANNEL_ID ?? "",
  lineLoginChannelSecret: process.env.LINE_LOGIN_CHANNEL_SECRET ?? "",
  lineMessagingToken: process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ?? "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  participationFeeJpy: Number(process.env.PARTICIPATION_FEE_JPY ?? "2000"),
} as const;

/**
 * モック判定の関数版(評価時点の process.env を読む)。
 * `env` オブジェクトはモジュール初期化時に確定するため、テストや
 * リクエスト毎に NODE_ENV / MOCK_* を差し替えたいコードはこちらを使う。
 * 本番フェイルクローズのロジックは mockFlag と同一。
 */
export function isMockAuthEnabled(): boolean {
  if ((process.env.NODE_ENV ?? "development") === "production") return false;
  return process.env.MOCK_AUTH !== "0";
}

export function isMockDbEnabled(): boolean {
  if ((process.env.NODE_ENV ?? "development") === "production") return false;
  return process.env.MOCK_DB !== "0";
}

export function isMockNotifyEnabled(): boolean {
  if ((process.env.NODE_ENV ?? "development") === "production") return false;
  return process.env.MOCK_NOTIFY !== "0";
}

/** 本番か(NODE_ENV==="production")。評価時点で判定。 */
export function isProduction(): boolean {
  return (process.env.NODE_ENV ?? "development") === "production";
}

// =============================================================================
// RELEASE_MODE — リリース前の集客フェーズと本稼働を切り替える全体フラグ
//   (01_s8_spec.md 要望3)。
//
//   waiting : 「リリースをお待ちください」待機画面で全体を覆う（本稼働前）。
//   open    : 本稼働（既定）。
//
// フェイルオープン側を既定にする理由: env の設定漏れ/打ち間違いで本番が誤って
// 待機画面に固まる（=機会損失）方が、誤って open になるより事業影響が大きい。
// したがって「明示的に waiting と書いたときだけ waiting」とし、それ以外は open。
//
// 重要: 公開プレビューAPI(src/app/api/public/**)は waiting でも閲覧可
//   （集客のため見せる）。このフラグを参照するのは全体UIゲートのみ
//   （待機画面は frontend worker 担当）。評価時点の process.env を読む。
// =============================================================================
export type ReleaseMode = "waiting" | "open";

export function releaseMode(): ReleaseMode {
  return process.env.RELEASE_MODE === "waiting" ? "waiting" : "open";
}
