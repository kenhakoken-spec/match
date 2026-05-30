"use client";

// VenueCandidateCard — S8 要望2. One venue candidate for an admin to choose/reject.
// Shows 店名 (link) / 食べログ点 / Google点 / 合コン向き度(fitScore, emphasized as the
// sort key), then 予約名 入力 + 「この店にする」(choose) / 「却下」(reject).
// Editorial/quiet per design-system §0/§4.7 — no hype, fitScore is a calm accent
// chip (not neon), scores are factual. Color is never the only signal.

import { useId, useState } from "react";
import type { VenueCandidateDTO } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";

export interface VenueCandidateCardProps {
  candidate: VenueCandidateDTO;
  onChoose: (reservationName: string) => void;
  onReject: () => void;
  busy?: boolean;
}

function fmtScore(v: number | null): string {
  return v !== null ? v.toFixed(1) : "—";
}

export function VenueCandidateCard({
  candidate,
  onChoose,
  onReject,
  busy,
}: VenueCandidateCardProps) {
  const [reservationName, setReservationName] = useState("");
  const inputId = useId();

  const trimmed = reservationName.trim();
  const canChoose = trimmed.length > 0 && !busy;

  function handleChoose() {
    if (!canChoose) return;
    onChoose(trimmed);
  }

  return (
    <div
      data-testid="venue-candidate"
      className="rounded-md border border-line-200 bg-bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {candidate.url ? (
            <a
              href={candidate.url}
              target="_blank"
              rel="noopener noreferrer"
              className="break-words font-sans text-[15px] font-semibold text-ink-900 underline-offset-2 hover:text-accent-600 hover:underline"
            >
              {candidate.name}
            </a>
          ) : (
            <span className="break-words font-sans text-[15px] font-semibold text-ink-900">
              {candidate.name}
            </span>
          )}
          <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-sans text-[12px] text-ink-500">
            <div className="flex items-center gap-1">
              <dt>食べログ</dt>
              <dd className="tabular-nums font-semibold text-ink-700">
                {fmtScore(candidate.tabelogScore)}
              </dd>
            </div>
            <div className="flex items-center gap-1">
              <dt>Google</dt>
              <dd className="tabular-nums font-semibold text-ink-700">
                {fmtScore(candidate.googleScore)}
              </dd>
            </div>
          </dl>
        </div>
        {/* 合コン向き度（ソート主キー）— 落ち着いたアクセントchip（ネオン化しない / §0）。 */}
        <div className="shrink-0 rounded-md border border-accent-500/40 bg-accent-100 px-2.5 py-1 text-center">
          <div className="font-sans text-[10px] font-semibold text-accent-600">
            合コン向き
          </div>
          <div className="font-sans text-[18px] font-bold leading-tight tabular-nums text-accent-600">
            {fmtScore(candidate.fitScore)}
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <TextField
          label="予約名"
          id={inputId}
          data-testid="venue-reservation-input"
          value={reservationName}
          onChange={(e) => setReservationName(e.target.value)}
          placeholder="例: 山田"
          disabled={busy}
          hint="この名前でお店に予約します。"
        />
        <div className="flex flex-wrap gap-2">
          <div className="sm:w-auto">
            <Button
              data-testid="venue-choose"
              onClick={handleChoose}
              disabled={!canChoose}
            >
              この店にする
            </Button>
          </div>
          <div className="sm:w-auto">
            <Button
              data-testid="venue-reject"
              variant="secondary"
              onClick={onReject}
              disabled={busy}
            >
              却下
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
