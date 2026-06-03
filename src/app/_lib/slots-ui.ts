// src/app/_lib/slots-ui.ts — S2 presentation helpers.
// Maps contract enums → labels / pill tones / glyphs / reason wording, and the
// fill-dot + remaining-count strings. Color is never the only signal: every
// status carries a label + a shape glyph (design-system §1.6 / §5).
//
// Sources: design-system.md §5.2/§5.3 (status mapping), §4.7A (condition chips),
// §4.7C (payment), §4.2 (fill dots); api-contract-s2.md §1 (reasons vocabulary).

import { AREA_LABELS } from "./types";
import type {
  ApplicationStatus,
  EligibilityReasonCode,
  SlotConditions,
  SlotDTO,
  SlotStatus,
} from "./api-s2";
import type { Gender } from "./types";

// StatusPill tone union (must match components/ui/StatusPill Tone).
export type PillTone =
  | "info"
  | "success"
  | "warn"
  | "muted"
  | "danger"
  | "accent"
  | "verified"
  | "trust";

export interface PillSpec {
  tone: PillTone;
  glyph: string;
  label: string;
}

// ---- slot.status (design-system §5.2). 募集中=info, 成立=accent(行動喚起の例外), etc. ----
export const SLOT_STATUS_PILL: Record<SlotStatus, PillSpec> = {
  open: { tone: "info", glyph: "○", label: "募集中" },
  filled: { tone: "accent", glyph: "●", label: "成立" },
  confirmed: { tone: "success", glyph: "✓", label: "会場決定" },
  done: { tone: "muted", glyph: "◌", label: "終了" },
  canceled: { tone: "muted", glyph: "◌", label: "中止" },
};

// ---- application.status (design-system §5.3). U-07 のグルーピングと表示。 ----
// applied=募集中(info), accepted=成立(accent: 次の行動を促す), canceled=取消(muted)。
export const APPLICATION_STATUS_PILL: Record<ApplicationStatus, PillSpec> = {
  applied: { tone: "info", glyph: "○", label: "募集中" },
  accepted: { tone: "accent", glyph: "●", label: "成立" },
  canceled: { tone: "muted", glyph: "◌", label: "取消 / 不成立" },
};

// U-07: 進行中(募集中・成立) を先に、終了(取消) を後に。
export function applicationSortKey(status: ApplicationStatus): number {
  switch (status) {
    case "accepted":
      return 0; // 最優先(次の行動)
    case "applied":
      return 1;
    case "canceled":
      return 2;
  }
}

// ---- reason wording (api-contract-s2.md §1). 条件不足は danger にしない。 ----
// tone: warn=本人/プロフィール等ユーザー側の準備不足(橙)、muted=枠側の事実(淡色)、
//       info=already_applied(中立)。**赤(danger)は使わない**(§8 NG)。
export interface ReasonSpec {
  text: string;
  tone: "warn" | "muted" | "info";
}

export const REASON_WORDING: Record<EligibilityReasonCode, ReasonSpec> = {
  identity_required: { text: "本人確認が完了すると応募できます", tone: "warn" },
  profile_required: { text: "プロフィールを登録すると応募できます", tone: "warn" },
  age_out_of_range: { text: "この枠は年齢条件の対象外です", tone: "muted" },
  badge_required: { text: "この枠は優良バッジ会員限定です", tone: "muted" },
  gender_full: { text: "この枠は定員に達しました", tone: "muted" },
  already_applied: { text: "すでに応募済みです", tone: "info" },
  slot_closed: { text: "この枠は募集を終了しました", tone: "muted" },
};

export function reasonSpec(code: EligibilityReasonCode): ReasonSpec {
  return REASON_WORDING[code] ?? { text: "現在この枠には応募できません", tone: "muted" };
}

// 一覧カード(U-04)の短い事実理由(muted)。最優先の1件だけを淡色で添える。
const LIST_REASON_PRIORITY: EligibilityReasonCode[] = [
  "age_out_of_range",
  "badge_required",
  "gender_full",
  "slot_closed",
  "already_applied",
];

export function shortIneligibleReason(reasons: EligibilityReasonCode[]): string | null {
  for (const r of LIST_REASON_PRIORITY) {
    if (reasons.includes(r)) {
      if (r === "age_out_of_range") return "あなたは対象外です";
      if (r === "badge_required") return "優良バッジ会員限定です";
      if (r === "gender_full") return "満員です";
      if (r === "slot_closed") return "募集を終了しました";
      if (r === "already_applied") return "応募済みです";
    }
  }
  return null;
}

// ---- condition chips (design-system §4.7A) ----
export interface ConditionChipSpec {
  label: string;
  withBadgeIcon: boolean; // ◆ prefix for 優良バッジ限定
}

// 年齢ラベル: 20〜29 → "20代限定" のプリセット、それ以外は範囲表現。
export function ageConditionLabel(minAge: number | null, maxAge: number | null): string | null {
  if (minAge == null && maxAge == null) return null;
  if (minAge != null && maxAge != null) {
    if (minAge % 10 === 0 && maxAge === minAge + 9) return `${minAge}代限定`;
    return `${minAge}〜${maxAge}歳`;
  }
  if (minAge != null) return `${minAge}歳以上`;
  return `${maxAge}歳以下`;
}

export function conditionChips(c: SlotConditions): ConditionChipSpec[] {
  const chips: ConditionChipSpec[] = [];
  const age = ageConditionLabel(c.minAge, c.maxAge);
  if (age) chips.push({ label: age, withBadgeIcon: false });
  if (c.requiresBadge === "premium") chips.push({ label: "優良バッジ限定", withBadgeIcon: true });
  return chips;
}

// 参加条件の箇条書き(U-05 詳細)。本人確認済みは常に必須として併記。
export function conditionLines(c: SlotConditions): string[] {
  const lines: string[] = [];
  const age = ageConditionLabel(c.minAge, c.maxAge);
  if (age) lines.push(age === "20代限定" ? "20代の方" : age + "の方");
  if (c.requiresBadge === "premium") lines.push("優良バッジをお持ちの方");
  lines.push("本人確認が完了している方");
  return lines;
}

// ---- fill dots (design-system §4.2 / §5.4): ●=確定 / ○=空き ----
export function fillDots(filled: number, capacity: number): string {
  const cap = Math.max(0, capacity);
  const f = Math.min(Math.max(0, filled), cap);
  return "●".repeat(f) + "○".repeat(cap - f);
}

export function remaining(filled: number, capacity: number): number {
  return Math.max(0, capacity - filled);
}

export function genderRemainingLabel(filled: number, capacity: number): string {
  const r = remaining(filled, capacity);
  return r === 0 ? "満" : `あと${r}`;
}

// まとめ残数: 「あと 女性1・男性2」/ 両方満員なら「満員」。
export function remainingText(slot: Pick<SlotDTO, "filled" | "capacityPerGender">): string {
  const rf = remaining(slot.filled.female, slot.capacityPerGender);
  const rm = remaining(slot.filled.male, slot.capacityPerGender);
  if (rf === 0 && rm === 0) return "満員";
  const parts: string[] = [];
  if (rf > 0) parts.push(`女性${rf}`);
  if (rm > 0) parts.push(`男性${rm}`);
  return `あと ${parts.join("・")}`;
}

// ---- 定員(S12 #10): 合計6名で柔軟(各性別 min〜max、2:4〜4:2 も成立)。 ----
// 厳密 3:3 を撤廃し、「あと○名で成立」(合計) を主表示にする。各性別の min/max は補足。
// SlotDTO/PublicSlotDTO どちらも capacityTotal/minPerGender/maxPerGender を持つ。
type FlexCapacityLike = {
  filled: { male: number; female: number };
  capacityTotal: number;
  minPerGender: number;
  maxPerGender: number;
};

/** 合計の残数(あと何名で成立か)。0 以上に丸める。 */
export function totalRemaining(slot: Pick<FlexCapacityLike, "filled" | "capacityTotal">): number {
  const filled = Math.max(0, slot.filled.male) + Math.max(0, slot.filled.female);
  return Math.max(0, slot.capacityTotal - filled);
}

/** 定員の説明文。例: 「男女あわせて6名（各2〜4名）」。min===max のときは範囲を出さない。 */
export function capacityText(slot: Pick<FlexCapacityLike, "capacityTotal" | "minPerGender" | "maxPerGender">): string {
  const range =
    slot.minPerGender === slot.maxPerGender
      ? `各${slot.minPerGender}名`
      : `各${slot.minPerGender}〜${slot.maxPerGender}名`;
  return `男女あわせて${slot.capacityTotal}名（${range}）`;
}

/**
 * 「あと○名で成立」中心の残数表示(合計ベース)。満席なら "満席です"。
 * 各性別の残枠が偏っている場合に限り、括弧で性別内訳を添える(任意・控えめ)。
 */
export function fillProgressText(slot: FlexCapacityLike): string {
  const rem = totalRemaining(slot);
  if (rem === 0) return "満席です";
  return `あと${rem}名で成立`;
}

export function yen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

export function areaLabel(area: SlotDTO["area"]): string {
  return AREA_LABELS[area];
}

// ---- client-side eligibility hint for the LIST (GET /api/slots omits eligibility) ----
// The authoritative check is the detail endpoint's `eligibility`; the list only
// dims + annotates as a hint (wireframes U-04). Returns the ineligible flag + a
// muted factual reason. Never produced as a danger/blaming signal.
export interface ListHint {
  ineligible: boolean;
  reason: string | null;
  full: boolean;
}

export function listHint(
  slot: SlotDTO,
  viewer: { gender: Gender | null; age: number | null; hasBadgePremium: boolean } | null,
): ListHint {
  const full =
    remaining(slot.filled.female, slot.capacityPerGender) === 0 &&
    remaining(slot.filled.male, slot.capacityPerGender) === 0;
  if (!viewer) return { ineligible: false, reason: null, full };

  if (slot.conditions.requiresBadge === "premium" && !viewer.hasBadgePremium) {
    return { ineligible: true, reason: "優良バッジ会員限定です", full };
  }
  if (viewer.age != null) {
    const tooYoung = slot.conditions.minAge != null && viewer.age < slot.conditions.minAge;
    const tooOld = slot.conditions.maxAge != null && viewer.age > slot.conditions.maxAge;
    if (tooYoung || tooOld) return { ineligible: true, reason: "あなたは対象外です", full };
  }
  if (viewer.gender) {
    const r = remaining(
      viewer.gender === "male" ? slot.filled.male : slot.filled.female,
      slot.capacityPerGender,
    );
    if (r === 0) return { ineligible: true, reason: "あなたの枠は満員です", full };
  }
  return { ineligible: false, reason: null, full };
}
