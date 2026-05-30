// src/components/slots/ApplicationCard.tsx — 応募状況カード (U-07).
// status pill (label + glyph, not color-only) + エリア/日時 + 文脈アクション。
// accepted(成立) は accent カードで最優先表示。canceled(不成立) は「課金なし」を明示。
import Link from "next/link";
import { StatusPill } from "@/components/ui/StatusPill";
import { formatDateTime } from "@/app/_lib/datetime";
import {
  APPLICATION_STATUS_PILL,
  areaLabel,
  remainingText,
} from "@/app/_lib/slots-ui";
import type { ApplicationListItem } from "@/app/_lib/api-s2";

// S3: `match` (when present) means this application became a 成立(Match). When set,
// the accepted row links to its 成立詳細(U-08) and reflects 会場決定 vs 会場手配中
// instead of the generic「枠の詳細」link. Other rows are unchanged from S2.
export function ApplicationCard({
  item,
  match,
}: {
  item: ApplicationListItem;
  match?: { id: string; venueConfirmed: boolean };
}) {
  const { slot, status } = item;
  const pill = APPLICATION_STATUS_PILL[status];
  const accent = status === "accepted";
  const matched = status === "accepted" && match != null;

  return (
    <div
      data-testid="application-row"
      className={[
        "rounded-md border p-4",
        accent ? "border-accent-300 bg-accent-100" : "border-line-200 bg-bg-surface",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusPill tone={pill.tone} glyph={pill.glyph}>
            {pill.label}
          </StatusPill>
          {/* 成立後の会場状態を label+glyph で併記(色のみに依存しない)。 */}
          {matched ? (
            match.venueConfirmed ? (
              <StatusPill tone="success" glyph="●">会場決定</StatusPill>
            ) : (
              <StatusPill tone="info" glyph="◷">会場手配中</StatusPill>
            )
          ) : null}
        </span>
        <span className="font-sans text-[12px] tabular-nums text-ink-500">
          {formatDateTime(slot.datetimeStart)}
        </span>
      </div>

      <p className="mt-2 font-serif text-[16px] text-ink-900">{areaLabel(slot.area)}</p>

      {status === "accepted" ? (
        <p className="mt-1 font-sans text-[13px] text-ink-700">
          {matched && match.venueConfirmed
            ? "会場が決まりました。当日の詳細をご確認ください。"
            : "6名が揃いました。会場が決まり次第お知らせします。"}
        </p>
      ) : status === "applied" ? (
        <p className="mt-1 font-sans text-[13px] text-ink-500">{remainingText(slot)}</p>
      ) : (
        // canceled / 不成立 — 決済不信の防止に「課金なし」を必ず明記。
        <p className="mt-1 font-sans text-[13px] text-state-muted">
          成立しませんでした。お支払いは発生していません。
        </p>
      )}

      <div className="mt-3">
        {matched ? (
          <Link
            href={`/matches/${match.id}`}
            className="font-sans text-[13px] font-semibold text-accent-600 hover:underline"
          >
            成立の詳細を見る →
          </Link>
        ) : (
          <Link
            href={`/slots/${slot.id}`}
            className="font-sans text-[13px] text-accent-500 hover:underline"
          >
            枠の詳細を見る ›
          </Link>
        )}
      </div>
    </div>
  );
}
