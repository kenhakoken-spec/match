// =============================================================================
// matching-app — DTO serializers (contract §1)
// PII方針: lineUserId は **絶対に** DTO に含めない(ここが唯一の出口関門)。
// birthdate は ProfileDTO に含めてよいが age を必ず併記(契約§1)。
// =============================================================================

import { calcAge, canApply } from "@/lib/domain";
import type {
  ProfileEntity,
  IdentityEntity,
  UserEntity,
  SlotEntity,
  ApplicationEntity,
  GenderCounts,
  MatchEntity,
  MatchMemberRow,
} from "@/lib/repo";
import type {
  ProfileDTO,
  MeResponse,
  MeUser,
  SlotDTO,
  SlotDetailDTO,
  SlotEligibility,
  VenueDTO,
  MatchStatus,
  MatchMemberDTO,
  MatchDetailDTO,
  MatchSummaryDTO,
  AdminMatchSummaryDTO,
  AdminMatchDetailDTO,
  PublicSlotDTO,
  PublicMemberDTO,
  MultiAxisRatings,
  VenueCandidateDTO,
} from "@/lib/types";

/** YYYY-MM-DD (UTC) に整形。 */
export function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function toProfileDTO(p: ProfileEntity, now: Date = new Date()): ProfileDTO {
  return {
    displayName: "", // 実呼び出しでは user.displayName を差し込む(下の buildMe で解決)
    gender: p.gender,
    birthdate: toDateOnly(p.birthdate),
    age: calcAge(p.birthdate, now),
    areaPref: p.areaPref,
    bio: p.bio,
    photoUrl: p.photoUrl,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
  };
}

/** プロフィール完成判定: 必須項目(gender/birthdate/areaPref>=1)が揃っているか。 */
export function hasCompleteProfile(p: ProfileEntity | null): boolean {
  if (!p) return false;
  if (!p.gender) return false;
  if (!p.birthdate || Number.isNaN(p.birthdate.getTime())) return false;
  if (!Array.isArray(p.areaPref) || p.areaPref.length < 1) return false;
  return true;
}

export function toMeUser(u: UserEntity): MeUser {
  // lineUserId は含めない。
  return {
    id: u.id,
    role: u.role,
    status: u.status,
    displayName: u.displayName,
  };
}

/** MeResponse を組み立てる(canApply は純関数で判定)。 */
export function buildMe(
  user: UserEntity,
  profile: ProfileEntity | null,
  identity: IdentityEntity | null,
  now: Date = new Date()
): MeResponse {
  const profileDTO: ProfileDTO | null = profile
    ? { ...toProfileDTO(profile, now), displayName: user.displayName ?? "" }
    : null;

  const complete = hasCompleteProfile(profile);
  const gate = canApply({
    identityStatus: identity ? identity.status : null,
    hasCompleteProfile: complete,
  });

  return {
    user: toMeUser(user),
    profile: profileDTO,
    identity: identity
      ? { status: identity.status, rejectReason: identity.reviewNote }
      : null,
    canApply: gate.ok,
    canApplyReason: gate.reason,
  };
}

// =============================================================================
// S2 — Slot serializers (api-contract-s2.md §1)
// =============================================================================

/** SlotEntity + 性別カウント → SlotDTO。 */
export function toSlotDTO(slot: SlotEntity, counts: GenderCounts): SlotDTO {
  return {
    id: slot.id,
    datetimeStart: slot.datetimeStart.toISOString(),
    area: slot.area,
    capacityPerGender: slot.capacityPerGender,
    filled: { male: counts.male, female: counts.female },
    conditions: {
      minAge: slot.minAge,
      maxAge: slot.maxAge,
      requiresBadge: slot.requiresBadge ? "premium" : null,
    },
    status: slot.status,
    feeMale: slot.feeMale,
  };
}

/** SlotDTO に自分の応募状態と eligibility を付した詳細DTO。 */
export function toSlotDetailDTO(
  slot: SlotEntity,
  counts: GenderCounts,
  myApplication: ApplicationEntity | null,
  eligibility: SlotEligibility
): SlotDetailDTO {
  return {
    ...toSlotDTO(slot, counts),
    myApplication: myApplication ? { status: myApplication.status } : null,
    eligibility,
  };
}

// =============================================================================
// S3 — Match serializers (api-contract-s3.md §1,§3)
// PII方針:
//  - members は displayName/gender のみ（lineUserId は **絶対に** 含めない）。
//  - 会場(venue)はユーザー向けでは **notified 後のみ** 返す（toMatchDetailDTO で制御）。
//  - canceled は MatchStatus(ユーザー/admin DTO)に含めない。呼び出し側で除外/防御する。
// =============================================================================

/** MatchEntity.status を DTO の MatchStatus に写像（canceled は防御的に pending 扱い）。 */
function toMatchStatus(status: MatchEntity["status"]): MatchStatus {
  if (status === "venue_set") return "venue_set";
  if (status === "notified") return "notified";
  // pending_venue / canceled（DTOに出さない想定）はいずれも手配前として扱う。
  return "pending_venue";
}

/** MatchEntity の会場フィールドから VenueDTO を組む（venueName 未設定なら null）。 */
export function toVenueDTO(m: MatchEntity): VenueDTO | null {
  if (!m.venueName) return null;
  return {
    venueName: m.venueName,
    venueUrl: m.venueUrl,
    reservationName: m.reservationName ?? "",
    meetingPlace: m.meetingPlace,
  };
}

/** メンバー行 → 最小 DTO（PII最小: lineUserId 不可、誕生日/連絡先も含めない）。 */
export function toMatchMemberDTO(row: MatchMemberRow): MatchMemberDTO {
  return {
    displayName: row.displayName ?? "",
    gender: row.gender,
  };
}

/**
 * ユーザー向け 成立詳細 DTO。
 * **会場は notified 後のみ返す**（契約§3: notified 前は venue=null＝会場手配中）。
 */
export function toMatchDetailDTO(
  m: MatchEntity,
  slot: SlotEntity,
  members: MatchMemberRow[]
): MatchDetailDTO {
  const status = toMatchStatus(m.status);
  return {
    id: m.id,
    slot: { datetimeStart: slot.datetimeStart.toISOString(), area: slot.area },
    status,
    // notified 前は会場を出さない（段階制御）。
    venue: status === "notified" ? toVenueDTO(m) : null,
    members: members.map(toMatchMemberDTO),
  };
}

/** ユーザー向け マイ成立一覧の項目（会場の中身は出さず確定有無のみ）。 */
export function toMatchSummaryDTO(m: MatchEntity, slot: SlotEntity): MatchSummaryDTO {
  return {
    id: m.id,
    slotId: m.slotId,
    slot: { datetimeStart: slot.datetimeStart.toISOString(), area: slot.area },
    status: toMatchStatus(m.status),
    venueConfirmed: m.status === "venue_set" || m.status === "notified",
  };
}

/** admin 向け 成立一覧の項目（会場は段階に関わらず返す＝運営は手配主体）。 */
export function toAdminMatchSummaryDTO(
  m: MatchEntity,
  slot: SlotEntity,
  counts: GenderCounts
): AdminMatchSummaryDTO {
  return {
    id: m.id,
    slotId: m.slotId,
    slot: { datetimeStart: slot.datetimeStart.toISOString(), area: slot.area },
    status: toMatchStatus(m.status),
    matchedAt: m.matchedAt.toISOString(),
    filled: { male: counts.male, female: counts.female },
    venue: toVenueDTO(m),
  };
}

/** admin 向け 成立詳細 DTO（6名要約 + 枠情報 + 会場）。 */
export function toAdminMatchDetailDTO(
  m: MatchEntity,
  slot: SlotEntity,
  counts: GenderCounts,
  members: MatchMemberRow[]
): AdminMatchDetailDTO {
  return {
    id: m.id,
    slotId: m.slotId,
    slot: {
      datetimeStart: slot.datetimeStart.toISOString(),
      area: slot.area,
      capacityPerGender: slot.capacityPerGender,
    },
    status: toMatchStatus(m.status),
    matchedAt: m.matchedAt.toISOString(),
    filled: { male: counts.male, female: counts.female },
    venue: toVenueDTO(m),
    members: members.map(toMatchMemberDTO),
  };
}

// =============================================================================
// S8 — 公開(プレビュー)DTO シリアライザ (api-contract-s8-foundation.md §3)
// PII除去の出口関門:
//   - toPublicSlotDTO  : SlotDTO のサブセット(個人特定情報なし)。
//   - toPublicMemberDTO: 氏名/displayName/photoUrl/lineUserId/正確な生年月日を **出さない**。
//                        年代バンド・職種・多軸評価・優良バッジのみ(要望1)。
//   - toAgeBand        : 生年月日 → "20代後半" 等の年代バンド(年齢そのものも出さない)。
// =============================================================================

/**
 * 生年月日を年代バンド文字列に変換する（PII最小化: 正確な生年月日も年齢も出さない）。
 * 例: 22歳 → "20代前半" / 27歳 → "20代後半" / 34歳 → "30代前半"。
 * - 20歳未満（年齢確認で実際にはほぼ無いが防御）→ "10代"。
 * - 不正な birthdate（NaN）や算出不能 → "年齢非公開"。
 * - 前半 = その10年代の 0〜4歳目（下1桁0-4）, 後半 = 5〜9歳目（下1桁5-9）。
 */
export function toAgeBand(birthdate: Date, now: Date = new Date()): string {
  const age = calcAge(birthdate, now);
  if (!Number.isFinite(age) || Number.isNaN(age)) return "年齢非公開";
  if (age < 20) return "10代";
  if (age >= 70) return "70代以上";
  const decade = Math.floor(age / 10) * 10; // 20,30,40...
  const half = age % 10 < 5 ? "前半" : "後半";
  return `${decade}代${half}`;
}

/** ProfileEntity の多軸集計（軸別平均 + 総合 + 件数）→ MultiAxisRatings。 */
export function toMultiAxisRatings(p: {
  scoreAgainAvg: number;
  scoreTalkAvg: number;
  scoreMannerAvg: number;
  ratingAvg: number;
  ratingCount: number;
}): MultiAxisRatings {
  return {
    again: p.scoreAgainAvg,
    talk: p.scoreTalkAvg,
    manner: p.scoreMannerAvg,
    overall: p.ratingAvg, // 総合は ratingAvg(=overall) を正本にする。
    count: p.ratingCount,
  };
}

/** SlotEntity + 性別カウント → 公開枠DTO（個人特定情報なし）。 */
export function toPublicSlotDTO(slot: SlotEntity, counts: GenderCounts): PublicSlotDTO {
  return {
    id: slot.id,
    datetimeStart: slot.datetimeStart.toISOString(),
    area: slot.area,
    capacityPerGender: slot.capacityPerGender,
    filled: { male: counts.male, female: counts.female },
    conditions: {
      minAge: slot.minAge,
      maxAge: slot.maxAge,
      requiresBadge: slot.requiresBadge ? "premium" : null,
    },
    feeMale: slot.feeMale,
    status: slot.status,
  };
}

/**
 * ProfileEntity（+ premium保有フラグ）→ 公開メンバーDTO。
 * **PII除去の要**: 氏名/displayName/photoUrl/lineUserId/正確な生年月日は受け取らない・出さない。
 * 年代バンド・職種・多軸評価・優良バッジのみを返す。
 */
export function toPublicMemberDTO(
  p: ProfileEntity,
  hasPremiumBadge: boolean,
  now: Date = new Date()
): PublicMemberDTO {
  return {
    ageBand: toAgeBand(p.birthdate, now),
    gender: p.gender,
    occupation: p.occupation,
    ratings: toMultiAxisRatings(p),
    hasPremiumBadge,
  };
}

/** VenueCandidateEntity → DTO（運営/レコメンド表示用。PIIなし）。 */
export function toVenueCandidateDTO(v: {
  id: string;
  slotId: string;
  name: string;
  url: string | null;
  tabelogScore: number | null;
  googleScore: number | null;
  fitScore: number | null;
  area: VenueCandidateDTO["area"];
  status: VenueCandidateDTO["status"];
}): VenueCandidateDTO {
  return {
    id: v.id,
    slotId: v.slotId,
    name: v.name,
    url: v.url,
    tabelogScore: v.tabelogScore,
    googleScore: v.googleScore,
    fitScore: v.fitScore,
    area: v.area,
    status: v.status,
  };
}
