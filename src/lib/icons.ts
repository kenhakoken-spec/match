// =============================================================================
// matching-app — プリセットアイコン定義 (S12 #8: 写真登録 → アイコン選択)
//
// 殿FB#8: 写真アップロードは廃止し、ユーザーは **プリセットアイコンを選ぶだけ**。
// 顔写真詐欺の土俵に乗らない方針(06_s12_strategy §2)。
//
// 本ファイルは **識別子(id)と表示ラベルのみ** を定義する。実際の描画(SVG/絵柄)は
// frontend が id をキーに行う(backend は画像実体を持たない)。Profile.iconKey に
// この ID 群のいずれかを保存する(アプリ層 zod が isValidIconKey で検証する)。
// =============================================================================

/**
 * プリセットアイコンの識別子一覧(10種)。
 * 動植物など中立で当たり障りのないモチーフに限定(性別/年齢/属性を匂わせない)。
 * 並びは選択UIの表示順を兼ねる。as const でリテラル union を保持する。
 */
export const ICON_IDS = [
  "fox", // きつね
  "cat", // ねこ
  "bear", // くま
  "rabbit", // うさぎ
  "panda", // ぱんだ
  "penguin", // ぺんぎん
  "leaf", // はっぱ
  "flower", // はな
  "star", // ほし
  "moon", // つき
] as const;

/** アイコン識別子の型(union)。Profile.iconKey が取りうる値。 */
export type IconKey = (typeof ICON_IDS)[number];

/** 選択UI用の日本語ラベル(frontend が表示名に使う)。 */
export const ICON_LABELS: Record<IconKey, string> = {
  fox: "きつね",
  cat: "ねこ",
  bear: "くま",
  rabbit: "うさぎ",
  panda: "ぱんだ",
  penguin: "ぺんぎん",
  leaf: "はっぱ",
  flower: "はな",
  star: "ほし",
  moon: "つき",
};

/** 既定アイコン(未選択時のフォールバック表示に使ってよい)。 */
export const DEFAULT_ICON_KEY: IconKey = "fox";

/**
 * 任意の文字列が有効なプリセットアイコン id かを判定する(型ガード)。
 * Profile 更新時の入力検証(zod refine 等)で使う。null/未知の値は false。
 */
export function isValidIconKey(value: unknown): value is IconKey {
  return typeof value === "string" && (ICON_IDS as readonly string[]).includes(value);
}
