// =============================================================================
// matching-app — S6 専用型(優良バッジ)。契約: api-contract-s6.md §3。
// 共有 src/lib/types.ts には**追記しない**(並行実装の鉄則)。S6専用の出口DTO。
//
// PII方針(types.ts の README に準拠):
//  - DTO に lineUserId / 生年月日 / トークンを出さない。
//  - 管理用一覧(AdminBadgeRowDTO)も userId(内部cuid)と displayName までに留める。
// =============================================================================

/** バッジ種別。MVPは premium のみ(schema BadgeType に一致)。 */
export type BadgeTypeDTO = "premium";

/**
 * バッジDTO(契約§3)。ユーザーの保有バッジ1件の出口表現。
 *  - type      : バッジ種別。
 *  - grantedAt : 付与日時(ISO8601文字列)。
 */
export interface BadgeDTO {
  type: BadgeTypeDTO;
  grantedAt: string;
}

/**
 * バッジ進捗DTO(契約§3)。GET /api/badges/mine の未取得時の現状表示。
 *  - hasPremium    : premium を保有済みか。
 *  - ratingAvg / ratingCount / attendedCount : 現在の評価集計・参加回数。
 *  - remaining     : 各基準までの不足分(0=達成済み)。premiumRemaining 由来。
 */
export interface BadgeProgressDTO {
  hasPremium: boolean;
  ratingAvg: number;
  ratingCount: number;
  attendedCount: number;
  remaining: {
    ratingAvg: number;
    ratingCount: number;
    attendedCount: number;
  };
}

/**
 * GET /api/badges/mine のレスポンス本体。
 *  - badges   : 保有バッジ一覧(0..n)。
 *  - progress : premium 取得に向けた現状・不足分(未取得でも取得済みでも返す)。
 */
export interface MyBadgesDTO {
  badges: BadgeDTO[];
  progress: BadgeProgressDTO;
}

/**
 * 管理用バッジ付与状況の1行(契約§2 A-10: GET /api/admin/badges)。
 *  - userId      : 対象ユーザーの内部ID(cuid)。lineUserId は出さない。
 *  - displayName : 表示名(無ければ null)。
 *  - type        : 付与済みバッジ種別。
 *  - grantedAt   : 付与日時(ISO8601)。
 *  - grantedBy   : 付与主体("system" = 自動付与 / admin の userId = 手動)。監査用。
 */
export interface AdminBadgeRowDTO {
  userId: string;
  displayName: string | null;
  type: BadgeTypeDTO;
  grantedAt: string;
  grantedBy: string | null;
}

/** 付与/取消アクションの結果(冪等性を呼び出し側へ伝える)。 */
export interface BadgeMutationResultDTO {
  userId: string;
  type: BadgeTypeDTO;
  /** granted=新規付与, already=既に保有(冪等で何もしない), revoked=取消, absent=元々未保有。 */
  outcome: "granted" | "already" | "revoked" | "absent";
  badge: BadgeDTO | null;
}
