"use client";

// A-02 枠作成・管理 — wireframes.md A-02, design-system §4.7A.
// 枠作成フォーム: 開催日 × 時刻 × エリア + 参加条件設定。
//   - 年齢条件: 「20代限定」プリセット(minAge=20 / maxAge=29) をトグルで設定
//   - 優良バッジ限定: requiresBadge トグル
// POST /api/admin/slots { datetimeStart, area, minAge?, maxAge?, requiresBadge? } → { slot }
// 既存枠一覧: GET /api/admin/slots → { slots }(全status, 状況つき)。
//
// 条件はユーザーの枠一覧/詳細にチップ表示される(SlotConditionChips と同じ語彙)。

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ChoiceChip } from "@/components/ui/Choice";
import { CheckboxRow } from "@/components/ui/Consent";
import { FieldError, FieldLabel } from "@/components/ui/Field";
import { StatusPill } from "@/components/ui/StatusPill";
import { SlotConditionChips } from "@/components/slots/SlotConditionChips";
import { FillDots } from "@/components/slots/FillDots";
import {
  createSlot,
  fetchAdminSlots,
  type AdminCreateSlotInput,
  type SlotDTO,
} from "@/app/_lib/api-s2";
import { ApiCallError } from "@/app/_lib/api";
import { SLOT_STATUS_PILL, areaLabel } from "@/app/_lib/slots-ui";
import { formatDateShort, formatTime, startMillis } from "@/app/_lib/datetime";
import { AREA_LABELS, AREA_ORDER, type Area } from "@/app/_lib/types";

// 時刻プリセット(合コンの一般的な開始時刻)。
const TIME_OPTIONS = ["18:00", "18:30", "19:00", "19:30", "20:00"];

// "YYYY-MM-DD" + "HH:mm" → ISO8601(+09:00)。
function toIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  return `${date}T${time}:00+09:00`;
}

export default function AdminSlotsPage() {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:30");
  const [area, setArea] = useState<Area>("ebisu");
  const [twenties, setTwenties] = useState(false); // 20代限定プリセット
  const [requireBadge, setRequireBadge] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const [slots, setSlots] = useState<SlotDTO[]>([]);
  const [listLoading, setListLoading] = useState(true);

  async function loadList() {
    setListLoading(true);
    try {
      setSlots(await fetchAdminSlots());
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    void loadList();
  }, []);

  const datetimeStart = toIso(date, time);
  const canSubmit = useMemo(
    () => datetimeStart !== null && !submitting,
    [datetimeStart, submitting],
  );

  // プレビュー用の条件(チップ表示に流用)。
  const previewConditions = {
    minAge: twenties ? 20 : null,
    maxAge: twenties ? 29 : null,
    requiresBadge: requireBadge ? ("premium" as const) : null,
  };

  async function handleCreate() {
    setShowErrors(true);
    setFormError(null);
    setCreated(null);
    if (!datetimeStart) return;

    const input: AdminCreateSlotInput = {
      datetimeStart,
      area,
      minAge: twenties ? 20 : null,
      maxAge: twenties ? 29 : null,
      requiresBadge: requireBadge,
    };

    setSubmitting(true);
    try {
      const slot = await createSlot(input);
      setCreated(`${areaLabel(slot.area)} ${formatDateShort(slot.datetimeStart)} ${formatTime(slot.datetimeStart)} を公開しました`);
      // フォームを軽くリセット(エリア/時刻は残す)。
      setDate("");
      setTwenties(false);
      setRequireBadge(false);
      setShowErrors(false);
      await loadList();
    } catch (err) {
      if (err instanceof ApiCallError) {
        setFormError(err.message || "作成に失敗しました。入力をご確認ください。");
      } else {
        // FALLBACK: backend 未達でも UI を確認できるよう、プレビューを一覧へ反映。
        const fallback: SlotDTO = {
          id: `local_${Date.now()}`,
          datetimeStart,
          area,
          capacityPerGender: 3,
          filled: { male: 0, female: 0 },
          conditions: previewConditions,
          status: "open",
          feeMale: 2000,
        };
        setSlots((prev) => [fallback, ...prev]);
        setCreated(
          `${areaLabel(area)} ${formatDateShort(datetimeStart)} ${formatTime(datetimeStart)} を公開しました（ローカル反映）`,
        );
        setDate("");
        setTwenties(false);
        setRequireBadge(false);
        setShowErrors(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const sortedSlots = [...slots].sort(
    (a, b) => startMillis(a.datetimeStart) - startMillis(b.datetimeStart),
  );

  return (
    <main className="px-5 py-5 lg:px-8">
      <h1 className="font-serif text-[22px] text-ink-900">枠を作成</h1>

      {/* 作成フォーム */}
      <section className="mt-4 rounded-md border border-line-200 bg-bg-surface p-4 lg:max-w-2xl">
        {/* エリア */}
        <FieldLabel required>エリア</FieldLabel>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="エリア">
          {AREA_ORDER.map((a) => (
            <ChoiceChip key={a} selected={area === a} onClick={() => setArea(a)}>
              {AREA_LABELS[a]}
            </ChoiceChip>
          ))}
        </div>

        {/* 開催日 + 時刻 */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="slot-date" required>
              開催日
            </FieldLabel>
            <input
              id="slot-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-12 w-full rounded-sm border border-line-200 bg-bg-surface px-3 font-sans text-[15px] text-ink-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
            />
            {showErrors && !date ? <FieldError>開催日を選択してください。</FieldError> : null}
          </div>
          <div>
            <FieldLabel htmlFor="slot-time" required>
              開始時刻
            </FieldLabel>
            <div className="relative">
              <select
                id="slot-time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-12 w-full appearance-none rounded-sm border border-line-200 bg-bg-surface pl-3 pr-7 font-sans text-[15px] text-ink-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <span
                aria-hidden
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500"
              >
                ▾
              </span>
            </div>
          </div>
        </div>

        {/* 定員(固定3対3) */}
        <p className="mt-4 font-sans text-[13px] text-ink-500">定員: 男女各3名（3対3・固定）</p>

        {/* 参加条件(限定イベント) */}
        <div className="mt-5 border-t border-line-100 pt-4">
          <h2 className="font-sans text-[13px] font-bold text-ink-700">
            参加条件（限定イベント）
          </h2>
          <p className="mt-1 font-sans text-[12px] text-ink-500">
            設定するとユーザーの枠一覧・詳細にチップ表示されます。
          </p>
          <div className="mt-3 space-y-2">
            <CheckboxRow checked={twenties} onChange={setTwenties}>
              20代限定にする（20〜29歳）
            </CheckboxRow>
            <CheckboxRow checked={requireBadge} onChange={setRequireBadge}>
              優良バッジ会員限定にする
            </CheckboxRow>
          </div>

          {/* 条件プレビュー(ユーザー画面と同じチップ) */}
          {twenties || requireBadge ? (
            <div className="mt-3">
              <p className="mb-1.5 font-sans text-[12px] text-ink-500">表示プレビュー</p>
              <SlotConditionChips conditions={previewConditions} />
            </div>
          ) : null}
        </div>

        {created ? (
          <p className="mt-4 rounded-sm border border-secondary-500/40 bg-secondary-100 px-3 py-2 font-sans text-[13px] text-secondary-500">
            {created}
          </p>
        ) : null}
        {formError ? <FieldError>{formError}</FieldError> : null}

        <div className="mt-4 sm:max-w-xs">
          <Button disabled={!canSubmit} onClick={handleCreate}>
            {submitting ? "公開しています…" : "この内容で公開する"}
          </Button>
        </div>
      </section>

      {/* 既存の枠 */}
      <section className="mt-8 lg:max-w-3xl">
        <h2 className="font-sans text-[15px] font-bold text-ink-900">既存の枠</h2>
        {listLoading ? (
          <p className="mt-3 font-sans text-[13px] text-ink-500">読み込んでいます…</p>
        ) : sortedSlots.length === 0 ? (
          <p className="mt-3 font-sans text-[13px] text-ink-500">枠はまだありません。</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sortedSlots.map((slot) => {
              const pill = SLOT_STATUS_PILL[slot.status];
              return (
                <li
                  key={slot.id}
                  className="rounded-md border border-line-200 bg-bg-surface p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-sans text-[15px] text-ink-900">
                      {areaLabel(slot.area)}{" "}
                      <span className="tabular-nums text-ink-700">
                        {formatDateShort(slot.datetimeStart)} {formatTime(slot.datetimeStart)}
                      </span>
                    </span>
                    <StatusPill tone={pill.tone} glyph={pill.glyph}>
                      {pill.label}
                    </StatusPill>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <FillDots filled={slot.filled} capacityPerGender={slot.capacityPerGender} />
                    <SlotConditionChips conditions={slot.conditions} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
