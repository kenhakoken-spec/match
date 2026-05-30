"use client";

// A-04 成立確認 — wireframes.md A-04, screen-flow.md §3/§4 STEP4-6.
// 成立(Match)の進捗一覧。各行から会場入力&通知(A-05)へドリルダウン。
// 状態は label+glyph で表す(色のみ禁止 / design-system §5)。
// GET /api/admin/matches → { matches: AdminMatchSummaryDTO[] }。

import { useEffect, useState } from "react";
import { StatusPill } from "@/components/ui/StatusPill";
import { ButtonLink } from "@/components/ui/Button";
import { fetchAdminMatches, type AdminMatchSummaryDTO, type MatchStatus } from "@/app/_lib/api-s3";
import { areaLabel } from "@/app/_lib/slots-ui";
import { formatDateShort, formatTime, startMillis } from "@/app/_lib/datetime";

const STATUS_PILL: Record<
  MatchStatus,
  { label: string; tone: "info" | "warn" | "success"; glyph: string }
> = {
  pending_venue: { label: "会場手配中", tone: "warn", glyph: "◷" },
  venue_set: { label: "会場入力済", tone: "info", glyph: "◐" },
  notified: { label: "通知済", tone: "success", glyph: "●" },
};

export default function AdminMatchesPage() {
  const [matches, setMatches] = useState<AdminMatchSummaryDTO[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setMatches(await fetchAdminMatches());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // 手配中 → 入力済 → 通知済 の順、同状態内は開催日時の昇順。
  const order: Record<MatchStatus, number> = { pending_venue: 0, venue_set: 1, notified: 2 };
  const sorted = [...matches].sort((a, b) => {
    const k = order[a.status] - order[b.status];
    if (k !== 0) return k;
    return startMillis(a.slot.datetimeStart) - startMillis(b.slot.datetimeStart);
  });

  return (
    <main className="px-5 py-5 lg:px-8">
      <h1 className="font-serif text-[22px] text-ink-900">成立確認</h1>
      <p className="mt-1 font-sans text-[13px] text-ink-500">
        6名で成立したグループです。会場を入力して6名へ通知を送信してください。
      </p>

      {loading ? (
        <p className="mt-4 font-sans text-[13px] text-ink-500">読み込んでいます…</p>
      ) : sorted.length === 0 ? (
        <p className="mt-4 font-sans text-[13px] text-ink-500">成立はまだありません。</p>
      ) : (
        <ul className="mt-4 space-y-2 lg:max-w-3xl">
          {sorted.map((m) => {
            const pill = STATUS_PILL[m.status];
            const venueSet = m.venue !== null;
            const memberCount = m.filled.female + m.filled.male;
            return (
              <li key={m.id} className="rounded-md border border-line-200 bg-bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-sans text-[15px] text-ink-900">
                      {areaLabel(m.slot.area)}{" "}
                      <span className="tabular-nums text-ink-700">
                        {formatDateShort(m.slot.datetimeStart)} {formatTime(m.slot.datetimeStart)}
                      </span>
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <StatusPill tone={pill.tone} glyph={pill.glyph}>
                        {pill.label}
                      </StatusPill>
                      <span className="font-sans text-[13px] tabular-nums text-ink-500">
                        {memberCount}/6名
                      </span>
                      <span className="font-sans text-[13px] text-ink-500">
                        会場 {venueSet ? "入力済" : "未入力"}
                      </span>
                    </div>
                  </div>
                  <div className="w-full sm:w-auto">
                    <ButtonLink href={`/admin/matches/${m.id}`} variant="secondary">
                      {m.status === "notified" ? "詳細を見る" : "会場入力・通知"}
                    </ButtonLink>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
