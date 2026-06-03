"use client";

// U-15 (一覧) 相互評価 — 評価可能なイベント一覧。
// 開催完了(done)のうち、自分が参加し まだ評価していない同席者が残るイベントを表示。
// 各イベントへ「評価する」で /ratings/[slotId] へ。誠実なトーン・任意であることを明示し、
// ランキング/競争/FOMO は出さない（design-system §4.7 D / §8）。
//
// GET /api/ratings/pending → PendingRatingDTO[]（bare array）。失敗時は FALLBACK。

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { Card } from "@/components/ui/Surface";
import { fetchPendingRatings, type PendingRatingDTO } from "@/app/_lib/api-rating";
import { formatDateShort, formatTime, startMillis } from "@/app/_lib/datetime";
import { areaLabel } from "@/app/_lib/slots-ui";

export default function RatingsListPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [items, setItems] = useState<PendingRatingDTO[]>([]);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const pending = await fetchPendingRatings();
      // 新しく開催されたものから（降順）。
      setItems([...pending].sort((a, b) => startMillis(b.datetime) - startMillis(a.datetime)));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col">
      <AppHeader title="評価のお願い" backHref="/mypage" serif />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <main className="flex-1 px-5 pt-4">
          <ErrorState onRetry={load} />
        </main>
      ) : items.length === 0 ? (
        <main className="flex-1 px-5 pt-4" data-testid="rating-list">
          <EmptyState
            glyph="★"
            title="いまは評価のお願いはありません"
            body="ご参加いただいた会が終わると、ご一緒した方への評価をこちらでお願いします。"
          />
        </main>
      ) : (
        <main className="flex-1 px-5 pb-12 pt-4">
          {/* 誠実なリード文。任意・匿名性を一覧の時点でも静かに添える。 */}
          <p className="font-sans text-[14px] leading-relaxed text-ink-700">
            ご一緒した方の印象を3つの観点で教えてください。評価は任意で、相手に個別開示されません。
          </p>

          <ul className="mt-4 space-y-3" data-testid="rating-list">
            {items.map((item) => (
              <li key={item.slotId} data-testid="rating-item">
                <Link
                  href={`/ratings/${encodeURIComponent(item.slotId)}`}
                  className="block rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
                >
                  <Card className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-serif text-[18px] text-ink-900">
                        {areaLabel(item.area)}の会
                      </p>
                      <p className="mt-0.5 font-sans text-[13px] tabular-nums text-ink-500">
                        {formatDateShort(item.datetime)} {formatTime(item.datetime)}
                      </p>
                      <p className="mt-1.5 font-sans text-[13px] text-ink-700">
                        未評価の方 {item.members.length}名
                      </p>
                    </div>
                    <span
                      aria-hidden
                      className="shrink-0 font-sans text-[13px] font-semibold text-accent-600"
                    >
                      評価する →
                    </span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </main>
      )}
    </div>
  );
}
