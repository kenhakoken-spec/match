// =============================================================================
// matching-app — S6 バッジサービス(route ↔ domain/repo の橋渡し)。
// 認証/認可・入力検証は route 側で済ませた前提。副作用のある集約はここに閉じ、
// 判定の純ロジックは domain/badge.ts(テスト対象)に委譲する。
// 正典: docs/backend/api-contract-s6.md §1,§2 / docs/backend/badge.md §3
//
// ファイル所有(契約§4): 本ファイルは S6 backend 所有。既存 Profile/User は
//   getRepo() 経由で **読み取りのみ**。バッジ永続化は repo/badge-repo.ts(専用ストア)。
// =============================================================================

import "server-only";
import { getRepo } from "@/lib/repo";
import {
  getBadgeRepo,
  type BadgeRecord,
} from "@/lib/repo/badge-repo";
import {
  qualifiesForPremium,
  premiumRemaining,
  type BadgeInput,
} from "@/lib/domain/badge";
import { sendNotification } from "@/lib/notify-mock";
import type {
  BadgeDTO,
  BadgeProgressDTO,
  MyBadgesDTO,
  AdminBadgeRowDTO,
  BadgeMutationResultDTO,
} from "@/lib/badge-types";

/** BadgeRecord → 出口 DTO(grantedBy/criteriaSnapshot は user 向けに出さない)。 */
function toBadgeDTO(record: BadgeRecord): BadgeDTO {
  return { type: "premium", grantedAt: record.grantedAt.toISOString() };
}

/**
 * あるユーザーの評価集計(Profile)を BadgeInput に解決する(読み取りのみ)。
 * Profile が無いユーザーは全て 0(=未充足)として扱う。
 */
async function loadBadgeInput(userId: string): Promise<BadgeInput> {
  const repo = getRepo();
  const profile = await repo.profiles.findByUserId(userId);
  return {
    ratingAvg: profile?.ratingAvg ?? 0,
    ratingCount: profile?.ratingCount ?? 0,
    attendedCount: profile?.attendedCount ?? 0,
  };
}

/**
 * 評価確定時の自動付与フック(契約§2)。
 *
 * !!! S5 結線点 !!!
 *   S5(評価)で「被評価者の Profile.ratingAvg/ratingCount を再計算した直後」に、
 *   その被評価者(rateeUserId)を引数にこの関数を呼ぶ。
 *   実結線(評価投稿エンドポイントからの呼び出し)は **統合時に開発将軍** が行う。
 *   ここでは「判定 → 冪等付与 → badge_granted 通知」までを副作用として完結させる。
 *
 * 手順(badge.md §3 付与処理):
 *  1. Profile から ratingAvg/ratingCount/attendedCount を読む(読み取りのみ)。
 *  2. qualifiesForPremium(純関数)で判定。false なら何もしない。
 *  3. true かつ未保有なら grantPremium(grantedBy="system", criteriaSnapshot 付き)。
 *  4. 新規付与時のみ badge_granted 通知を記録(冪等: 既保有なら通知も出さない)。
 *
 * 戻り値: 付与したか(granted) + 保有レコード(無資格は null)。
 */
export async function evaluateAndGrantOnRating(
  rateeUserId: string
): Promise<{ granted: boolean; record: BadgeRecord | null }> {
  const input = await loadBadgeInput(rateeUserId);

  // 2. 純関数で判定。
  if (!qualifiesForPremium(input)) {
    return { granted: false, record: null };
  }

  // 3. 冪等付与(grantedBy=system + 付与根拠スナップショット)。
  const badgeRepo = getBadgeRepo();
  const { record, created } = await badgeRepo.grantPremium({
    userId: rateeUserId,
    grantedBy: "system",
    criteria: input,
  });

  // 4. 新規付与時のみ通知(冪等: 既保有なら二重通知しない)。
  if (created) {
    await sendNotification({
      userId: rateeUserId,
      type: "badge_granted",
      // PII最小: 運用情報のみ。lineUserId/個人名/誕生日は入れない。
      payload: {
        kind: "badge_granted",
        badgeType: "premium",
        message: "優良バッジ(premium)が付与されました。",
      },
    });
  }

  return { granted: created, record };
}

/**
 * 手動付与(admin)。grantedBy=admin の userId。冪等(既保有は created=false)。
 * 手動付与でも、その時点の評価集計を criteriaSnapshot として残す(監査)。
 */
export async function adminGrantPremium(
  targetUserId: string,
  adminUserId: string
): Promise<BadgeMutationResultDTO> {
  const input = await loadBadgeInput(targetUserId);
  const badgeRepo = getBadgeRepo();
  const { record, created } = await badgeRepo.grantPremium({
    userId: targetUserId,
    grantedBy: adminUserId,
    criteria: input,
  });

  if (created) {
    await sendNotification({
      userId: targetUserId,
      type: "badge_granted",
      payload: {
        kind: "badge_granted",
        badgeType: "premium",
        message: "優良バッジ(premium)が付与されました。",
      },
    });
  }

  return {
    userId: targetUserId,
    type: "premium",
    outcome: created ? "granted" : "already",
    badge: toBadgeDTO(record),
  };
}

/** 取消(admin)。元々未保有なら outcome=absent(冪等)。 */
export async function adminRevokePremium(
  targetUserId: string
): Promise<BadgeMutationResultDTO> {
  const badgeRepo = getBadgeRepo();
  const { existed } = await badgeRepo.revokePremium(targetUserId);
  return {
    userId: targetUserId,
    type: "premium",
    outcome: existed ? "revoked" : "absent",
    badge: null,
  };
}

/**
 * GET /api/badges/mine の本体。自分のバッジ一覧 + 進捗(未取得時の現状)。
 * 取得済みでも進捗(remaining 全0)を返す(UIが一貫して扱えるよう)。
 */
export async function getMyBadges(userId: string): Promise<MyBadgesDTO> {
  const badgeRepo = getBadgeRepo();
  const premium = await badgeRepo.findPremium(userId);
  const input = await loadBadgeInput(userId);

  const badges: BadgeDTO[] = premium ? [toBadgeDTO(premium)] : [];

  const progress: BadgeProgressDTO = {
    hasPremium: premium !== null,
    ratingAvg: input.ratingAvg,
    ratingCount: input.ratingCount,
    attendedCount: input.attendedCount,
    remaining: premium
      ? { ratingAvg: 0, ratingCount: 0, attendedCount: 0 }
      : premiumRemaining(input),
  };

  return { badges, progress };
}

/**
 * GET /api/admin/badges の本体(A-10)。付与状況一覧。
 * displayName は表示用に User から読み取り(lineUserId は出さない)。
 */
export async function listAdminBadges(): Promise<AdminBadgeRowDTO[]> {
  const badgeRepo = getBadgeRepo();
  const repo = getRepo();
  const records = await badgeRepo.listPremium();

  const rows: AdminBadgeRowDTO[] = [];
  for (const r of records) {
    const user = await repo.users.findById(r.userId);
    rows.push({
      userId: r.userId,
      displayName: user?.displayName ?? null,
      type: "premium",
      grantedAt: r.grantedAt.toISOString(),
      grantedBy: r.grantedBy,
    });
  }
  return rows;
}
