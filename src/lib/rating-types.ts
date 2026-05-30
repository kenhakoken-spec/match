// =============================================================================
// matching-app — S5 専用型（相互評価）。契約: api-contract-s5.md §3。
// 共有 src/lib/types.ts には **追記しない**（並行実装の鉄則）。S5 はこのファイルで完結。
//
// PII方針: メンバーは userId / displayName のみ。lineUserId / 誕生日 / 連絡先は出さない。
// 評価コメントは保存時にサニタイズ済みの値のみ DTO に載せる（route の責務）。
// =============================================================================

import type { Area } from "@/lib/types";

/** 評価1件の DTO（送信結果の確認・received 一覧で使用）。 */
export interface RatingDTO {
  id: string;
  slotId: string;
  /** 評価される人（被評価者）の userId。 */
  rateeId: string;
  /** スコア（1〜5）。 */
  score: number;
  /** 任意コメント（サニタイズ済み・最大300）。 */
  comment: string | null;
  /** 作成日時（ISO8601）。 */
  createdAt: string;
}

/** pending 一覧の同席者1名（PII最小: userId / displayName のみ）。 */
export interface PendingMemberDTO {
  userId: string;
  displayName: string;
}

/**
 * 評価可能なイベント1件（done 参加 & 未評価の同席者が残っている Slot）。
 * 契約§3: slotId / datetime / area / members[{userId,displayName}]。
 */
export interface PendingRatingDTO {
  slotId: string;
  /** 開催日時（ISO8601）。 */
  datetime: string;
  area: Area;
  /** まだ評価していない同席者（自分以外）。空になった Slot は一覧から落ちる。 */
  members: PendingMemberDTO[];
}

/** 受領評価サマリ（後方互換の単一スコア集計）。Profile.ratingAvg/ratingCount と同値。 */
export interface RatingSummary {
  /** 平均評価（0.0〜5.0・小数1桁）。 */
  avg: number;
  /** 受領件数。 */
  count: number;
}

/**
 * S8 多軸 受領評価サマリ（/api/ratings/received/summary）。
 * 各軸平均 + 総合(overall) + 件数。domain/rating の MultiAxisAggregate と同形。
 */
export interface MultiAxisRatingSummary {
  /** 「また会いたい」軸の平均（小数1桁）。 */
  again: number;
  /** 「会話」軸の平均（小数1桁）。 */
  talk: number;
  /** 「マナー」軸の平均（小数1桁）。 */
  manner: number;
  /** 総合平均（3軸の全スコア平均・小数1桁）。 */
  overall: number;
  /** 受領件数。 */
  count: number;
}
