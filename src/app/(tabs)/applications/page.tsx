"use client";

// U-07 マイ応募状況 (下部タブ) — wireframes.md U-07, design-system §5.3.
// 自分の応募を状態別に表示。成立(accepted) を最優先(accent)で目立たせ、不成立(canceled)
// には「課金なし」を明記(決済不信の防止 / §5)。各状態は label+glyph で表す(色のみ禁止)。
//
// S2: GET /api/applications → { items: [{ slot, status }] }。
// S3: GET /api/matches/mine → { items: MatchSummaryDTO[] } を併せて取得し、accepted の
//   応募に対し「成立(=会場手配中) / 会場決定」を反映、成立詳細(U-08)へ遷移させる。
//   相関キーは slotId（MatchSummaryDTO.slotId と ApplicationListItem.slot.id）。

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { ButtonLink } from "@/components/ui/Button";
import { ApplicationCard } from "@/components/slots/ApplicationCard";
import { fetchApplications, type ApplicationListItem } from "@/app/_lib/api-s2";
import { fetchMyMatches, type MatchSummaryDTO } from "@/app/_lib/api-s3";
import { applicationSortKey } from "@/app/_lib/slots-ui";
import { startMillis } from "@/app/_lib/datetime";

export default function ApplicationsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [items, setItems] = useState<ApplicationListItem[]>([]);
  // slotId -> 成立(Match) 概要。accepted な応募の会場状況/詳細リンクの相関に使う。
  const [matchBySlot, setMatchBySlot] = useState<Map<string, MatchSummaryDTO>>(new Map());

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const [apps, matches] = await Promise.all([fetchApplications(), fetchMyMatches()]);
      setItems(apps);
      setMatchBySlot(new Map(matches.map((m) => [m.slotId, m])));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 成立 → 募集中 → 取消 の順、同状態内は開催日時の昇順。
  const sorted = [...items].sort((a, b) => {
    const k = applicationSortKey(a.status) - applicationSortKey(b.status);
    if (k !== 0) return k;
    return startMillis(a.slot.datetimeStart) - startMillis(b.slot.datetimeStart);
  });

  return (
    <>
      <AppHeader title="応募状況" />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <main className="flex-1 px-5 pt-4">
          <ErrorState onRetry={load} />
        </main>
      ) : sorted.length === 0 ? (
        <main className="flex-1 px-5 pb-10 pt-4">
          <EmptyState
            glyph="◇"
            title="まだ応募はありません"
            body="気になる枠に応募すると、ここで成立や会場の状況を確認できます。"
            action={<ButtonLink href="/browse">枠をさがす</ButtonLink>}
          />
        </main>
      ) : (
        <main className="flex-1 px-5 pb-10 pt-4">
          <ul className="space-y-3">
            {sorted.map((item) => {
              // accepted の応募に対応する成立があれば、その確定有無と id で U-08 へ。
              // 成立一覧が取れない場合(古い backend 等)は slot.status==="confirmed" で近似。
              const m = item.status === "accepted" ? matchBySlot.get(item.slot.id) : undefined;
              const match =
                item.status === "accepted"
                  ? m
                    ? { id: m.id, venueConfirmed: m.venueConfirmed }
                    : { id: item.slot.id, venueConfirmed: item.slot.status === "confirmed" }
                  : undefined;
              return (
                <li key={`${item.slot.id}-${item.status}`}>
                  <ApplicationCard item={item} match={match} />
                  {/*
                    成立済の枠には「お支払い／参加の確定」導線を最小で添える。
                    課金可否(無料/¥2,000)はサーバ(computeFee)が決めるため、ここで
                    性別判定はせず、リンク先(U-14)が intent で判定・分岐する。
                  */}
                  {item.status === "accepted" ? (
                    <Link
                      href={`/payment/${item.slot.id}`}
                      data-testid="pay-link"
                      className="mt-2 flex min-h-[44px] items-center justify-between rounded-md border border-line-200 bg-bg-surface px-4 py-2.5 transition-colors hover:bg-bg-sunken"
                    >
                      <span className="font-sans text-[13px] text-ink-700">
                        参加費のお支払い・確定
                      </span>
                      <span className="font-sans text-[13px] font-semibold text-accent-600">
                        お支払いへ →
                      </span>
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </main>
      )}
    </>
  );
}
