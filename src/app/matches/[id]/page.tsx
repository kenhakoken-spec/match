"use client";

// U-08 成立詳細（会場情報表示）— wireframes.md U-08, screen-flow.md §4 STEP7/8.
// チャット無しの本サービスでは、この画面が「当日の案内所」。一目で当日に必要な情報
// （日時 / エリア / 店名 / 予約URL / 予約名 / 集合 / メンバー6名）へ到達できること。
//
// 重要(契約 api-contract-s3.md §3 / src/lib/serializers.ts): 会場とメンバーは
// status==="notified" のときだけ返る。notified 前(pending_venue / venue_set)は
// venue=null・members=[] なので「会場を手配中です」を静かに出す。メンバーは PII 最小
// (displayName + gender のみ)。GET /api/matches/[id] → { match: MatchDetailDTO }。

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState, LoadingState } from "@/components/States";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Surface";
import { StatusPill } from "@/components/ui/StatusPill";
import { fetchMatch, type MatchDetailDTO } from "@/app/_lib/api-s3";
import { formatDateShort, formatTime } from "@/app/_lib/datetime";
import { areaLabel } from "@/app/_lib/slots-ui";
import { GENDER_LABELS } from "@/app/_lib/types";

// Next.js 14 では params は同期オブジェクト（Promiseではない）。use(params) は
// React error #438 でクラッシュするため、/slots/[id] と同じ同期paramsに統一。
export default function MatchDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [match, setMatch] = useState<MatchDetailDTO | null>(null);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      setMatch(await fetchMatch(id));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppHeader title="成立詳細" backHref="/applications" serif />
      {loading ? (
        <LoadingState />
      ) : error || !match ? (
        <main className="flex-1 px-5 pt-4" data-testid="match-detail">
          <ErrorState onRetry={load} />
        </main>
      ) : (
        <MatchBody match={match} />
      )}
    </div>
  );
}

function MatchBody({ match }: { match: MatchDetailDTO }) {
  const notified = match.status === "notified";
  const dateLabel = `${formatDateShort(match.slot.datetimeStart)} ${formatTime(match.slot.datetimeStart)}`;
  const area = areaLabel(match.slot.area);

  return (
    <main className="flex-1 px-5 pb-12 pt-4" data-testid="match-detail">
      {/* 日時 + エリア + 状態 — 常に最上部 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-serif text-[22px] text-ink-900">{dateLabel}</p>
          <p className="mt-0.5 font-sans text-[14px] text-ink-500">{area}エリア</p>
        </div>
        {notified ? (
          <StatusPill tone="success" glyph="●">会場決定</StatusPill>
        ) : (
          <StatusPill tone="info" glyph="◷">会場手配中</StatusPill>
        )}
      </div>

      {notified && match.venue ? (
        <>
          {/* 会場ブロック — 当日に必要な6要素を簡潔に (design-system §4.5) */}
          <Card className="mt-5 space-y-3" data-testid="venue-info">
            <h2 className="font-sans text-[13px] font-bold text-ink-700">会場のご案内</h2>
            <VenueRow label="店名" value={match.venue.venueName} />
            <VenueRow label="エリア" value={`${area}エリア`} />
            <VenueRow label="日時" value={dateLabel} />
            <VenueRow label="予約名" value={`「${match.venue.reservationName}」で予約`} />
            {match.venue.meetingPlace ? (
              <VenueRow label="集合" value={match.venue.meetingPlace} />
            ) : null}
            {match.venue.venueUrl ? (
              <div className="pt-1">
                <ButtonLink
                  href={match.venue.venueUrl}
                  variant="secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  予約ページを開く
                </ButtonLink>
              </div>
            ) : null}
          </Card>

          {/* メンバー — displayName + gender のみ(PII最小) */}
          <section className="mt-6">
            <h2 className="font-sans text-[15px] font-bold text-ink-900">
              メンバー（{match.members.length}名）
            </h2>
            <ul className="mt-3 space-y-2">
              {match.members.map((m, i) => (
                <li
                  key={`${m.displayName}-${i}`}
                  className="flex items-center justify-between rounded-md border border-line-200 bg-bg-surface px-4 py-3"
                >
                  <span className="font-sans text-[15px] text-ink-900">{m.displayName}</span>
                  <span className="font-sans text-[13px] text-ink-500">{GENDER_LABELS[m.gender]}</span>
                </li>
              ))}
            </ul>
          </section>

          <p className="mt-6 font-sans text-[13px] leading-relaxed text-ink-500">
            当日は会場に直接お集まりください。連絡はアプリ内ではなく、この画面と LINE のお知らせでご案内します。
          </p>
        </>
      ) : (
        // pending_venue / venue_set — まだ会場は出さない。落ち着いた事実ベース。
        <Card className="mt-5 space-y-2">
          <p className="font-sans text-[16px] font-semibold text-ink-900">会場を手配中です。</p>
          <p className="font-sans text-[14px] leading-relaxed text-ink-500">
            6名での成立が確定しました。運営がただいま会場を手配しています。店名・予約名・集合場所は、
            決まりしだいこの画面と LINE のお知らせでご案内します。
          </p>
          <p className="font-sans text-[13px] text-ink-500">日時 {dateLabel}／{area}エリア</p>
        </Card>
      )}
    </main>
  );
}

function VenueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-12 shrink-0 font-sans text-[13px] font-semibold text-ink-500">{label}</span>
      <span className="font-sans text-[15px] leading-relaxed text-ink-900">{value}</span>
    </div>
  );
}
