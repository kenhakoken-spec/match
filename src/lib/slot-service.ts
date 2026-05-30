// =============================================================================
// matching-app — S2 slot application service (route ↔ domain/repo の薄い橋渡し)
// 認証/認可は route 側(guard)で済ませた前提で、応募者の状態を集約して
// evaluateEligibility(純関数)に渡す入力を組み立てる。副作用のある集約はここ、
// 判定そのものは domain/eligibility.ts(テスト対象)に閉じる。
// 正典: docs/backend/api-contract-s2.md §4 / docs/backend/matching-logic.md §5
// =============================================================================

import "server-only";
import { calcAge } from "@/lib/domain";
import {
  evaluateEligibility,
  type EligibilityResult,
  type EligibilityActor,
} from "@/lib/domain/eligibility";
import { hasCompleteProfile } from "@/lib/serializers";
import { getRepo } from "@/lib/repo";
import type { SlotEntity, ApplicationEntity, GenderCounts } from "@/lib/repo";

export interface SlotContext {
  slot: SlotEntity;
  counts: GenderCounts;
  myApplication: ApplicationEntity | null;
  eligibility: EligibilityResult;
}

/**
 * 応募者(userId)から見た枠(slot)の状態 + eligibility を集約する。
 * - profile/identity/badge を repo から引き、応募者の actor を構築。
 * - 有効応募カウントと「自分の応募」を取得。
 * - alreadyApplied は applied/accepted を有効とみなす。
 * - 判定は純関数 evaluateEligibility に委譲(サーバ側の唯一の真実)。
 */
export async function buildSlotContext(
  slot: SlotEntity,
  userId: string,
  now: Date = new Date()
): Promise<SlotContext> {
  const repo = getRepo();

  const [profile, identity, hasPremium, counts, myApplication] = await Promise.all([
    repo.profiles.findByUserId(userId),
    repo.identities.findByUserId(userId),
    repo.badges.hasPremium(userId),
    repo.applications.countActiveByGender(slot.id),
    repo.applications.findBySlotAndUser(slot.id, userId),
  ]);

  const complete = hasCompleteProfile(profile);
  const actor: EligibilityActor = {
    identityStatus: identity ? identity.status : null,
    hasCompleteProfile: complete,
    gender: complete && profile ? profile.gender : null,
    age: complete && profile ? calcAge(profile.birthdate, now) : null,
    hasBadgePremium: hasPremium,
  };

  const alreadyApplied =
    myApplication !== null &&
    (myApplication.status === "applied" || myApplication.status === "accepted");

  const eligibility = evaluateEligibility({
    actor,
    slot: {
      minAge: slot.minAge,
      maxAge: slot.maxAge,
      requiresBadge: slot.requiresBadge,
      status: slot.status,
      filled: counts,
      capacityPerGender: slot.capacityPerGender,
    },
    alreadyApplied,
  });

  return { slot, counts, myApplication, eligibility };
}
