"use client";

// A-05 会場入力 & 通知送信 — wireframes.md A-05, screen-flow.md §4 STEP6-7.
// 1) 成立した6名を確認 → 2) 会場(店名/予約URL/予約名/集合)を入力して保存(venue)
// → 3)「6名へ通知を送信」(notify) → 4) 送信結果(6名分)を表示 → 5)「開催完了にする」(complete)。
// 通知は会場入力済(venue_set)のときだけ送信できる(契約 §2: 未入力なら 409 venue_not_set)。
// 開催完了は notified 後のみ(契約 §2: 未通知なら 409 not_notified)。
// 状態は label+glyph で表す(色のみ禁止)。煽らない誠実なトーン。
//
// POST /api/admin/matches/[id]/venue  { venueName, venueUrl?, reservationName, meetingPlace? }
//   → { match: AdminMatchDetailDTO }
// POST /api/admin/matches/[id]/notify → { match: AdminMatchDetailDTO, notified: number }
// POST /api/admin/matches/[id]/complete → { slotStatus, attendedIncremented }

import { use, useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState, LoadingState } from "@/components/States";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { TextField } from "@/components/ui/Field";
import { VenueCandidateCard } from "@/components/VenueCandidateCard";
import {
  listVenues,
  suggestVenues,
  chooseVenue,
  rejectVenue,
} from "@/app/_lib/api-venue";
import type { VenueCandidateDTO } from "@/lib/types";
import {
  completeMatch,
  fetchAdminMatch,
  saveVenue,
  sendNotify,
  type AdminMatchDetailDTO,
  type MatchMemberDTO,
  type MatchStatus,
} from "@/app/_lib/api-s3";
import { areaLabel } from "@/app/_lib/slots-ui";
import { formatDateShort, formatTime } from "@/app/_lib/datetime";
import { GENDER_LABELS } from "@/app/_lib/types";

const STATUS_PILL: Record<
  MatchStatus,
  { label: string; tone: "info" | "warn" | "success"; glyph: string }
> = {
  pending_venue: { label: "会場手配中", tone: "warn", glyph: "◷" },
  venue_set: { label: "会場入力済", tone: "info", glyph: "◐" },
  notified: { label: "通知済", tone: "success", glyph: "●" },
};

export default function AdminMatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [match, setMatch] = useState<AdminMatchDetailDTO | null>(null);

  // venue form
  const [venueName, setVenueName] = useState("");
  const [venueUrl, setVenueUrl] = useState("");
  const [reservationName, setReservationName] = useState("");
  const [meetingPlace, setMeetingPlace] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // notify
  const [notifying, setNotifying] = useState(false);
  const [notifiedCount, setNotifiedCount] = useState<number | null>(null);
  const [notifyError, setNotifyError] = useState<string | null>(null);

  // complete
  const [completing, setCompleting] = useState(false);
  const [completeMsg, setCompleteMsg] = useState<string | null>(null);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  // venue candidates (S8 要望2) — additive; the manual venue form below is unchanged.
  const [candidates, setCandidates] = useState<VenueCandidateDTO[]>([]);
  const [candLoading, setCandLoading] = useState(false);
  const [candError, setCandError] = useState<string | null>(null);
  const [candMsg, setCandMsg] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [candBusyId, setCandBusyId] = useState<string | null>(null);

  function applyMatch(m: AdminMatchDetailDTO) {
    setMatch(m);
    if (m.venue) {
      setVenueName(m.venue.venueName);
      setVenueUrl(m.venue.venueUrl ?? "");
      setReservationName(m.venue.reservationName);
      setMeetingPlace(m.venue.meetingPlace ?? "");
    }
  }

  async function load() {
    setLoading(true);
    setError(false);
    try {
      applyMatch(await fetchAdminMatch(id));
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

  const slotId = match?.slotId ?? null;

  const loadCandidates = useCallback(async (sid: string) => {
    setCandLoading(true);
    setCandError(null);
    try {
      setCandidates(await listVenues(sid));
    } catch {
      setCandError("候補の読み込みに失敗しました。");
    } finally {
      setCandLoading(false);
    }
  }, []);

  useEffect(() => {
    if (slotId) void loadCandidates(slotId);
  }, [slotId, loadCandidates]);

  async function handleSuggest() {
    if (!slotId) return;
    setSuggesting(true);
    setCandError(null);
    setCandMsg(null);
    const outcome = await suggestVenues(slotId);
    setSuggesting(false);
    if (outcome.ok && outcome.items) {
      setCandidates(outcome.items);
      setCandMsg(
        outcome.created && outcome.created > 0
          ? `候補を${outcome.created}件生成しました。`
          : "候補は生成済みです。",
      );
    } else {
      setCandError(outcome.errorMessage ?? "候補生成に失敗しました。");
    }
  }

  async function handleChooseCandidate(candidateId: string, reservationName_: string) {
    setCandBusyId(candidateId);
    setCandError(null);
    setCandMsg(null);
    const outcome = await chooseVenue(candidateId, { reservationName: reservationName_ });
    setCandBusyId(null);
    if (outcome.ok) {
      setCandMsg("会場を確定しました。下の「6名へ通知を送信」でメンバーに連絡できます。");
      // Refresh the match so the venue fields/status reflect the choice, then the list.
      await load();
      if (slotId) await loadCandidates(slotId);
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

  async function handleRejectCandidate(candidateId: string) {
    setCandBusyId(candidateId);
    setCandError(null);
    const outcome = await rejectVenue(candidateId);
    setCandBusyId(null);
    if (outcome.ok) {
      if (slotId) await loadCandidates(slotId);
    } else {
      setCandError(outcome.errorMessage ?? "却下に失敗しました。");
    }
  }

  const venueValid = venueName.trim() !== "" && reservationName.trim() !== "";
  const venueSaved = match?.status === "venue_set" || match?.status === "notified";
  const notified = match?.status === "notified";

  async function handleSaveVenue() {
    setSaveMsg(null);
    setSaveError(null);
    if (!venueValid) {
      setSaveError("店名と予約名は必須です。");
      return;
    }
    setSaving(true);
    const outcome = await saveVenue(id, {
      venueName: venueName.trim(),
      venueUrl: venueUrl.trim() || undefined,
      reservationName: reservationName.trim(),
      meetingPlace: meetingPlace.trim() || undefined,
    });
    setSaving(false);
    if (outcome.ok && outcome.match) {
      applyMatch(outcome.match);
      setSaveMsg("会場を保存しました。6名へ通知を送信できます。");
    } else {
      setSaveError(outcome.errorMessage ?? "会場の保存に失敗しました。入力をご確認ください。");
    }
  }

  async function handleNotify() {
    setNotifyError(null);
    setNotifying(true);
    const outcome = await sendNotify(id);
    setNotifying(false);
    if (outcome.ok) {
      setNotifiedCount(outcome.notified ?? match?.members.length ?? 0);
      if (outcome.match) applyMatch(outcome.match);
      else setMatch((prev) => (prev ? { ...prev, status: "notified" } : prev));
    } else {
      setNotifyError(
        outcome.errorCode === "venue_not_set"
          ? "先に会場を入力してください。"
          : outcome.errorMessage ?? "通知の送信に失敗しました。もう一度お試しください。",
      );
    }
  }

  async function handleComplete() {
    setCompleteError(null);
    setCompleteMsg(null);
    setCompleting(true);
    const outcome = await completeMatch(id);
    setCompleting(false);
    if (outcome.ok) {
      setCompleted(true);
      setCompleteMsg(`開催完了にしました。${outcome.attendedIncremented ?? 0}名の参加を記録しました。`);
    } else {
      setCompleteError(
        outcome.errorCode === "already_done"
          ? "この会はすでに開催完了済みです。"
          : outcome.errorCode === "not_notified"
            ? "先に6名へ通知を送信してください。"
            : outcome.errorMessage ?? "開催完了の記録に失敗しました。もう一度お試しください。",
      );
    }
  }

  return (
    <div>
      <AppHeader title="会場入力・通知送信" backHref="/admin/matches" />
      {loading ? (
        <LoadingState />
      ) : error || !match ? (
        <main className="px-5 py-5">
          <ErrorState onRetry={load} />
        </main>
      ) : (
        <main className="px-5 py-5 lg:max-w-3xl lg:px-8">
          {/* 概要 */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-serif text-[20px] text-ink-900">
                {areaLabel(match.slot.area)}{" "}
                <span className="tabular-nums">
                  {formatDateShort(match.slot.datetimeStart)} {formatTime(match.slot.datetimeStart)}
                </span>
              </p>
              <p className="mt-0.5 font-sans text-[13px] tabular-nums text-ink-500">
                男女各3名・{match.filled.female + match.filled.male}名で成立
              </p>
            </div>
            <StatusPill tone={STATUS_PILL[match.status].tone} glyph={STATUS_PILL[match.status].glyph}>
              {STATUS_PILL[match.status].label}
            </StatusPill>
          </div>

          {/* 6名確認 — PII最小(displayName + gender)。 */}
          <section className="mt-6">
            <h2 className="font-sans text-[15px] font-bold text-ink-900">
              成立メンバー（{match.members.length}名）
            </h2>
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
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

          {/* 会場候補（S8 要望2）— 合コン向き度の高い順。1つ選んで予約名を入れて確定。 */}
          <section className="mt-8">
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
            <p className="mt-1 font-sans text-[13px] text-ink-500">
              候補から1つ選んで予約名を入れると会場が確定します。手動入力も下で行えます。
            </p>
            {candMsg ? (
              <p className="mt-3 rounded-sm border border-secondary-500/40 bg-secondary-100 px-3 py-2 font-sans text-[13px] text-secondary-500">
                {candMsg}
              </p>
            ) : null}
            {candError ? (
              <p role="alert" className="mt-3 font-sans text-[13px] text-state-danger">
                {candError}
              </p>
            ) : null}
            {candLoading ? (
              <p className="mt-3 font-sans text-[13px] text-ink-500">読み込んでいます…</p>
            ) : candidates.length === 0 ? (
              <p className="mt-3 font-sans text-[13px] text-ink-500">
                候補がありません。「候補生成」で作成してください。
              </p>
            ) : (
              <div data-testid="venue-candidate-list" className="mt-3 space-y-3">
                {candidates.map((c) => (
                  <VenueCandidateCard
                    key={c.id}
                    candidate={c}
                    busy={candBusyId === c.id}
                    onChoose={(name) => handleChooseCandidate(c.id, name)}
                    onReject={() => handleRejectCandidate(c.id)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* 会場入力フォーム（手動入力） */}
          <section className="mt-8 border-t border-line-100 pt-6">
            <h2 className="font-sans text-[15px] font-bold text-ink-900">会場を入力（手動）</h2>
            <p className="mt-1 font-sans text-[13px] text-ink-500">
              候補を使わない場合は、店舗の予約後にここで入力してください。保存すると6名へ通知を送信できます。
            </p>
            <div className="mt-3 space-y-4" data-testid="venue-form">
              <TextField
                label="店名"
                id="venueName"
                required
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                placeholder="個室イタリアン トラットリア恵比寿"
              />
              <TextField
                label="予約URL"
                id="venueUrl"
                type="url"
                value={venueUrl}
                onChange={(e) => setVenueUrl(e.target.value)}
                placeholder="https://..."
                hint="任意。お店の予約ページやマップのリンク。"
              />
              <TextField
                label="予約名"
                id="reservationName"
                required
                value={reservationName}
                onChange={(e) => setReservationName(e.target.value)}
                placeholder="田中"
              />
              <TextField
                label="集合場所"
                id="meetingPlace"
                value={meetingPlace}
                onChange={(e) => setMeetingPlace(e.target.value)}
                placeholder="恵比寿駅 西口 18:55 集合"
                hint="任意。駅・出口・時間など。"
              />
              {saveMsg ? (
                <div className="flex items-center gap-2">
                  <StatusPill tone="success" glyph="✓">保存済</StatusPill>
                  <span className="font-sans text-[13px] text-ink-500">{saveMsg}</span>
                </div>
              ) : null}
              {saveError ? (
                <p role="alert" className="font-sans text-[13px] text-state-danger">{saveError}</p>
              ) : null}
              <div className="sm:max-w-xs">
                <Button data-testid="venue-save" onClick={handleSaveVenue} disabled={saving || !venueValid}>
                  {saving ? "保存しています…" : venueSaved ? "会場を更新する" : "会場を保存する"}
                </Button>
              </div>
            </div>
          </section>

          {/* 通知送信 */}
          <section className="mt-8 border-t border-line-100 pt-6">
            <h2 className="font-sans text-[15px] font-bold text-ink-900">6名へ通知を送信</h2>
            <p className="mt-1 font-sans text-[13px] leading-relaxed text-ink-500">
              {venueSaved
                ? "会場が入力されました。6名へ「会場が決まりました」のお知らせ（日時・エリア・店名・予約名・集合）を送信します。"
                : "会場を保存すると、6名へ通知を送信できます。"}
            </p>

            {/* 送信プレビュー (master_plan §3-7 の要素) */}
            {venueSaved && match.venue ? (
              <div className="mt-3 rounded-md border border-line-200 bg-bg-sunken p-3.5">
                <p className="font-sans text-[12px] font-semibold text-ink-500">送信プレビュー</p>
                <p className="mt-1.5 font-sans text-[14px] leading-relaxed text-ink-700">
                  会場が決まりました。{areaLabel(match.slot.area)}・
                  {formatDateShort(match.slot.datetimeStart)} {formatTime(match.slot.datetimeStart)}／
                  {match.venue.venueName}／予約名「{match.venue.reservationName}」
                  {match.venue.meetingPlace ? `／${match.venue.meetingPlace}` : ""}
                </p>
              </div>
            ) : null}

            {notifyError ? (
              <p role="alert" className="mt-2 font-sans text-[13px] text-state-danger">{notifyError}</p>
            ) : null}
            <div className="mt-3 sm:max-w-xs">
              <Button
                data-testid="notify-send"
                onClick={handleNotify}
                disabled={!venueSaved || notifying}
              >
                {notifying ? "送信しています…" : notified ? "もう一度送信する" : "6名へ通知を送信"}
              </Button>
            </div>

            {/* 送信結果 (6名分) — notified 数 + メンバーから「送信済」を表示。 */}
            {notified && notifiedCount !== null ? (
              <div className="mt-5">
                <div className="flex items-center gap-2">
                  <StatusPill tone="success" glyph="●">通知済</StatusPill>
                  <span className="font-sans text-[13px] tabular-nums text-ink-500">
                    {notifiedCount}/{match.members.length}名へ配信しました
                  </span>
                </div>
                <ul className="mt-3 space-y-2">
                  {match.members.map((m, i) => (
                    <NotifyRow key={`${m.displayName}-${i}`} member={m} />
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {/* 開催完了 — notified 後のみ。 */}
          <section className="mt-8 border-t border-line-100 pt-6">
            <h2 className="font-sans text-[15px] font-bold text-ink-900">開催の記録</h2>
            <p className="mt-1 font-sans text-[13px] leading-relaxed text-ink-500">
              開催が済んだら完了にしてください。参加者の参加回数を記録し、評価のご案内に進みます。
            </p>
            {completeMsg ? (
              <div className="mt-3 flex items-center gap-2">
                <StatusPill tone="success" glyph="✓">完了</StatusPill>
                <span className="font-sans text-[13px] text-ink-500">{completeMsg}</span>
              </div>
            ) : null}
            {completeError ? (
              <p role="alert" className="mt-2 font-sans text-[13px] text-state-danger">{completeError}</p>
            ) : null}
            <div className="mt-3 sm:max-w-xs">
              <Button
                data-testid="mark-complete"
                variant="secondary"
                onClick={handleComplete}
                disabled={!notified || completing || completed}
              >
                {completing ? "記録しています…" : completed ? "開催完了済み" : "開催完了にする"}
              </Button>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

// 通知の宛先1名分（送信済の証跡）。チャネル名 + 送信済 pill。
function NotifyRow({ member }: { member: MatchMemberDTO }) {
  return (
    <li className="flex items-center justify-between rounded-md border border-line-200 bg-bg-surface px-4 py-2.5">
      <span className="font-sans text-[14px] text-ink-900">{member.displayName}</span>
      <span className="flex items-center gap-2">
        <span className="font-sans text-[12px] uppercase tracking-wide text-ink-300">line</span>
        <StatusPill tone="success" glyph="✓">送信済</StatusPill>
      </span>
    </li>
  );
}
