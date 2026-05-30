// src/components/slots/SlotConditionChips.tsx — 参加条件チップ群 (U-04 / U-05).
// Reuses the S1 ConditionChip primitive (design-system §4.7A): neutral pill, the
// condition is factual info — color never signals urgency. 優良バッジ限定 gets a ◆.
import { ConditionChip } from "@/components/ui/StatusPill";
import { conditionChips } from "@/app/_lib/slots-ui";
import type { SlotConditions } from "@/app/_lib/api-s2";

export function SlotConditionChips({ conditions }: { conditions: SlotConditions }) {
  const chips = conditionChips(conditions);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5" role="list" aria-label="参加条件">
      {chips.map((chip) => (
        <span key={chip.label} role="listitem">
          <ConditionChip withBadgeIcon={chip.withBadgeIcon}>{chip.label}</ConditionChip>
        </span>
      ))}
    </div>
  );
}
