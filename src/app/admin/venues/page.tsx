"use client";

// 会場候補（S8 要望2）— 運営が成立枠に対し合コン向きの会場候補を確認し、
// 1つ選んで予約名を入れて確定（choose）／不要を却下（reject）／候補生成（suggest）。
// 候補は GET /api/admin/venues?slotId= で fitScore 降順。choose で会場確定 → 既存の
// 通知フロー（A-05）へ。ここは候補の確認・選択に集中し、通知は成立詳細側で行う。
//
// 設計: design-system §7（admin は PC 想定・横広）/ §0（編集的・煽らない）。
// 状態は色のみに依存しない（StatusPill は glyph + label を併記 / §5）。

import { useCallback, useEffect, useState } from "react";
import { fetchAdminSlots, type SlotDTO } from "@/app/_lib/api-s2";
import {
  listVenues,
  suggestVenues,
  chooseVenue,
  rejectVenue,
} from "@/app/_lib/api-venue";
import type { VenueCandidateDTO } from "@/lib/types";
import { StatusPill } from "@/components/ui/StatusPill";
import { VenueCandidateCard } from "@/components/VenueCandidateCard";
import { SLOT_STATUS_PILL, areaLabel, remainingText } from "@/app/_lib/slots-ui";
import { formatDateShort, formatTime, startMillis } from "@/app/_lib/datetime";

export default function AdminVenuesPage() {
  const [slots, setSlots] = useState<SlotDTO[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);

  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<VenueCandidateDTO[]>([]);
  const [candLoading, setCandLoading] = useState(false);
  const [candError, setCandError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await fetchAdminSlots();
        if (active) setSlots(data);
      } finally {
        if (active) setSlotsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const loadCandidates = useCallback(async (slotId: string) => {
    setCandLoading(true);
    setCandError(null);
    try {
      setCandidates(await listVenues(slotId));
    } catch {
      setCandError("候補の読み込みに失敗しました。");
    } finally {
      setCandLoading(false);
    }
  }, []);

  function handleSelectSlot(slotId: string) {
    setSelectedSlotId(slotId);
    setActionMsg(null);
    setCandError(null);
    void loadCandidates(slotId);
  }

  async function handleSuggest() {
    if (!selectedSlotId) return;
    setSuggesting(true);
    setActionMsg(null);
    setCandError(null);
    const outcome = await suggestVenues(selectedSlotId);
    setSuggesting(false);
    if (outcome.ok && outcome.items) {
      setCandidates(outcome.items);
      setActionMsg(
        outcome.created && outcome.created > 0
          ? `候補を${outcome.created}件生成しました。`
          : "候補は生成済みです。",
      );
    } else {
      setCandError(outcome.errorMessage ?? "候補生成に失敗しました。");
    }
  }

  async function handleChoose(candidateId: string, reservationName: string) {
    setBusyId(candidateId);
    setActionMsg(null);
    setCandError(null);
    const outcome = await chooseVenue(candidateId, { reservationName });
    setBusyId(null);
    if (outcome.ok) {
      const name = outcome.match?.venue?.venueName ?? outcome.candidate?.name ?? "会場";
      setActionMsg(
        `「${name}」に確定しました（予約名: ${reservationName}）。成立詳細から6名へ通知できます。`,
      );
      if (selectedSlotId) await loadCandidates(selectedSlotId);
    } else {
      setCandError(
        outcome.errorCode === "candidate_not_suggestable"
          ? "この候補はすでに選択／却下済みです。"
          : outcome.errorCode === "match_not_settable"
            ? "この枠は通知済みのため会場を変更できません。"
            : outcome.errorMessage ?? "会場の確定に失敗しました。",
      );
    }
  }

  async function handleReject(candidateId: string) {
    setBusyId(candidateId);
    setActionMsg(null);
    setCandError(null);
    const outcome = await rejectVenue(candidateId);
    setBusyId(null);
    if (outcome.ok) {
      if (selectedSlotId) await loadCandidates(selectedSlotId);
    } else {
      setCandError(outcome.errorMessage ?? "却下に失敗しました。");
    }
  }

  // 成立しうる枠（filled/confirmed/done）を上に、開催日時の昇順。
  const sortedSlots = [...slots].sort(
    (a, b) => startMillis(a.datetimeStart) - startMillis(b.datetimeStart),
  );

  return (
    <main className="px-5 py-5 lg:px-8">
      <h1 className="font-serif text-[22px] text-ink-900">会場候補</h1>
      <p className="mt-1 font-sans text-[13px] text-ink-500">
        枠を選ぶと、合コン向きの会場候補が点数つきで表示されます。1つ選んで予約名を入れて確定してください。
      </p>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        {/* 枠の選択 */}
        <section>
          <h2 className="font-sans text-[15px] font-bold text-ink-900">枠を選択</h2>
          {slotsLoading ? (
            <p className="mt-3 font-sans text-[13px] text-ink-500">読み込んでいます…</p>
          ) : sortedSlots.length === 0 ? (
            <p className="mt-3 font-sans text-[13px] text-ink-500">枠がありません。</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {sortedSlots.map((s) => {
                const active = s.id === selectedSlotId;
                const pill = SLOT_STATUS_PILL[s.status];
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      data-testid="venue-slot-option"
                      onClick={() => handleSelectSlot(s.id)}
                      aria-current={active ? "true" : undefined}
                      className={[
                        "block w-full rounded-md border p-3 text-left transition-colors",
                        active
                          ? "border-accent-500 bg-accent-100"
                          : "border-line-200 bg-bg-surface hover:bg-bg-sunken",
                      ].join(" ")}
                    >
                      <span className="font-sans text-[14px] text-ink-900">
                        {areaLabel(s.area)}{" "}
                        <span className="tabular-nums text-ink-700">
                          {formatDateShort(s.datetimeStart)} {formatTime(s.datetimeStart)}
                        </span>
                      </span>
                      <span className="mt-1.5 flex items-center gap-2">
                        <StatusPill tone={pill.tone} glyph={pill.glyph}>
                          {pill.label}
                        </StatusPill>
                        <span className="font-sans text-[12px] text-ink-500">
                          {remainingText(s)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 候補一覧 */}
        <section>
          {!selectedSlotId ? (
            <p className="font-sans text-[13px] text-ink-500">
              左の枠を選ぶと会場候補が表示されます。
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-sans text-[15px] font-bold text-ink-900">
                  会場候補（合コン向き度の高い順）
                </h2>
                <button
                  type="button"
                  data-testid="venue-suggest"
                  onClick={handleSuggest}
                  disabled={suggesting}
                  className="inline-flex h-10 items-center rounded-md border border-accent-500 px-4 font-sans text-[13px] font-semibold text-accent-600 transition-colors hover:bg-accent-100 disabled:cursor-not-allowed disabled:border-line-200 disabled:text-ink-300"
                >
                  {suggesting ? "生成しています…" : "候補生成"}
                </button>
              </div>

              {actionMsg ? (
                <p
                  data-testid="venue-action-msg"
                  className="mt-3 rounded-sm border border-secondary-500/40 bg-secondary-100 px-3 py-2 font-sans text-[13px] text-secondary-500"
                >
                  {actionMsg}
                </p>
              ) : null}
              {candError ? (
                <p role="alert" className="mt-3 font-sans text-[13px] text-state-danger">
                  {candError}
                </p>
              ) : null}

              {candLoading ? (
                <p className="mt-4 font-sans text-[13px] text-ink-500">読み込んでいます…</p>
              ) : candidates.length === 0 ? (
                <p className="mt-4 font-sans text-[13px] text-ink-500">
                  候補がありません。「候補生成」で作成してください。
                </p>
              ) : (
                <div data-testid="venue-candidate-list" className="mt-4 space-y-3">
                  {candidates.map((c) => (
                    <VenueCandidateCard
                      key={c.id}
                      candidate={c}
                      busy={busyId === c.id}
                      onChoose={(name) => handleChoose(c.id, name)}
                      onReject={() => handleReject(c.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
