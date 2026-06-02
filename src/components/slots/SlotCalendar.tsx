"use client";

// src/components/slots/SlotCalendar.tsx — 会の月カレンダー (s11 §3).
// 「会を日付で見られる」要望(#3)の最小実装。週ビューは作らない(過剰回避)。
//
// 設計(s11 §3.1/§3.3):
//   - 取得済みの slots をクライアントで JST 日付グルーピングするだけ(新API不要)。
//   - カレンダーは開催日を示す「目次」。会の本体は選択日のカードをカレンダー直下に縦積み(画面遷移なし)。
//   - 開催日に accent ドット、今日は控えめ、選択日は塗り、開催無し日はタップ不可。
//   - 初期選択 = 開催日のうち最も近い未来の日(無ければ最も近い過去)。空で止めない。
//   - SSR/CSR 一致のため JST 固定(jstDateParts / ymdKeyOf を使用)。
//   - SlotCard / PublicSlotCard を renderCard で差し込み、1つのカレンダーを両画面で共有(DRY)。
//
// 色は既存トークンのみ(design-system §7)。新トークン・tailwind.config 変更なし。
// 曜日色は §2.2 と統一(平日 ink-700 / 土 state-info / 日 accent-600)。色のみに依存しない。

import { useMemo, useState, type ReactNode } from "react";
import { EmptyState } from "@/components/States";
import { jstDateParts, weekdayColorClass, ymdKeyOf, startMillis } from "@/app/_lib/datetime";

const WEEKDAY_HEADERS = ["日", "月", "火", "水", "木", "金", "土"];

// 日数(うるう年対応)。month は 1..12。
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// その月1日の曜日(0=日..6=土)を JST 基準で。先頭の空セル数に使う。
function firstWeekdayOf(year: number, month: number): number {
  // JST のその月1日 00:00 に相当する瞬間を UTC で表し、曜日を読む。
  // 1日 00:00 JST = 前日 15:00 UTC。new Date(Date.UTC(y, m-1, 1, -9, ...)) でも良いが
  // 単純に「日付の曜日」は時差で変わらないため UTC 正午で安全に判定する。
  return new Date(Date.UTC(year, month - 1, 1, 12)).getUTCDay();
}

export function SlotCalendar<T>({
  slots,
  isoOf,
  keyOf,
  renderCard,
  emptyMonthBody = "翌月以降に順次公開します。",
}: {
  slots: T[];
  isoOf: (s: T) => string;
  keyOf: (s: T) => string | number;
  renderCard: (s: T) => ReactNode;
  emptyMonthBody?: ReactNode;
}) {
  // ymdKey → その日の会(開始時刻昇順)。
  const byDay = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const s of slots) {
      const k = jstDateParts(isoOf(s)).ymdKey;
      const arr = map.get(k);
      if (arr) arr.push(s);
      else map.set(k, [s]);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => startMillis(isoOf(a)) - startMillis(isoOf(b)));
    }
    return map;
  }, [slots, isoOf]);

  // 初期選択日 = 最も近い未来の開催日。無ければ最も近い過去(=最新)。空配列なら null。
  const initialKey = useMemo(() => {
    if (slots.length === 0) return null;
    const now = Date.now();
    const sorted = [...slots].sort((a, b) => startMillis(isoOf(a)) - startMillis(isoOf(b)));
    const future = sorted.find((s) => startMillis(isoOf(s)) >= now);
    const pick = future ?? sorted[sorted.length - 1];
    return jstDateParts(isoOf(pick)).ymdKey;
  }, [slots, isoOf]);

  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey);

  // 表示中の年月。初期は選択日の月(無ければ今日の月)。
  const initialMonth = useMemo(() => {
    const base = selectedKey
      ? selectedKey
      : (() => {
          const t = jstDateParts(new Date().toISOString());
          return ymdKeyOf(t.year, t.month, t.day);
        })();
    const [y, m] = base.split("-").map(Number);
    return { year: y, month: m };
  }, [selectedKey]);

  const [view, setView] = useState(initialMonth);

  const todayKey = jstDateParts(new Date().toISOString()).ymdKey;

  // 表示月のセル配列(先頭空白＋1..末日)。
  const cells = useMemo(() => {
    const lead = firstWeekdayOf(view.year, view.month);
    const total = daysInMonth(view.year, view.month);
    const out: (number | null)[] = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= total; d++) out.push(d);
    return out;
  }, [view]);

  // 表示月に会が1件でもあるか(会ゼロ月の EmptyState 判定)。
  const monthHasAny = useMemo(() => {
    const prefix = `${view.year}-${String(view.month).padStart(2, "0")}-`;
    for (const k of byDay.keys()) if (k.startsWith(prefix)) return true;
    return false;
  }, [byDay, view]);

  function goMonth(delta: number) {
    setView((v) => {
      const idx = v.year * 12 + (v.month - 1) + delta;
      const next = { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
      // 月送り時、移動先の月の最も早い開催日を選び直す(選択日と表示月の不一致を防ぐ / s11 §3.3)。
      const prefix = `${next.year}-${String(next.month).padStart(2, "0")}-`;
      const daysInNext = [...byDay.keys()].filter((k) => k.startsWith(prefix)).sort();
      setSelectedKey(daysInNext[0] ?? null);
      return next;
    });
  }

  // 選択日が表示中の月にある時だけ、その日の会を出す(月送り直後のズレを防ぐ)。
  const selectedInView =
    selectedKey != null &&
    selectedKey.startsWith(`${view.year}-${String(view.month).padStart(2, "0")}-`);
  const selectedSlots = selectedInView ? (byDay.get(selectedKey!) ?? []) : [];
  const selectedParts = selectedInView
    ? (() => {
        const [y, m, d] = selectedKey!.split("-").map(Number);
        return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() };
      })()
    : null;

  return (
    <div>
      {/* 月送り */}
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => goMonth(-1)}
          aria-label="前の月"
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-bg-sunken active:bg-bg-sunken"
        >
          <span aria-hidden className="text-[18px]">‹</span>
        </button>
        <p className="font-serif text-[18px] text-ink-900 tabular-nums">
          {view.year}年 {view.month}月
        </p>
        <button
          type="button"
          onClick={() => goMonth(1)}
          aria-label="次の月"
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-bg-sunken active:bg-bg-sunken"
        >
          <span aria-hidden className="text-[18px]">›</span>
        </button>
      </div>

      {/* 曜日見出し(日=暖色 / 土=青系 / 平日 ink-500) */}
      <div className="mt-2 grid grid-cols-7">
        {WEEKDAY_HEADERS.map((w, i) => (
          <div
            key={w}
            aria-hidden
            className={[
              "py-1 text-center font-sans text-[11px]",
              i === 0 ? "text-accent-600" : i === 6 ? "text-state-info" : "text-ink-500",
            ].join(" ")}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 日セル */}
      <div className="mt-1 grid grid-cols-7 gap-y-1 border-t border-line-100 pt-2">
        {cells.map((day, i) => {
          if (day == null) return <div key={`e${i}`} aria-hidden />;
          const key = ymdKeyOf(view.year, view.month, day);
          const has = byDay.has(key);
          const isSelected = key === selectedKey;
          const isToday = key === todayKey;
          const wd = (firstWeekdayOf(view.year, view.month) + (day - 1)) % 7;

          return (
            <div key={key} className="flex justify-center">
              <button
                type="button"
                disabled={!has}
                onClick={() => has && setSelectedKey(key)}
                aria-label={
                  has
                    ? `${view.month}月${day}日（${WEEKDAY_HEADERS[wd]}） 会${byDay.get(key)!.length}件`
                    : `${view.month}月${day}日（${WEEKDAY_HEADERS[wd]}）`
                }
                aria-pressed={has ? isSelected : undefined}
                className={[
                  "relative flex h-11 w-11 flex-col items-center justify-center rounded-full font-sans text-[14px] tabular-nums transition-colors",
                  isSelected
                    ? "bg-accent-500 text-white"
                    : has
                      ? "text-ink-900 hover:bg-bg-sunken active:bg-bg-sunken"
                      : "cursor-default text-ink-500",
                  // 今日(未選択時のみ強調・控えめに ring)。塗りは選択を優先。
                  isToday && !isSelected ? "ring-1 ring-line-200" : "",
                ].join(" ")}
              >
                <span className="leading-none">{day}</span>
                {/* 開催日マーク(ドット1つ=会あり。件数は出さない / s11 §3.3)。選択日は白面なので白ドット。 */}
                {has ? (
                  <span
                    aria-hidden
                    className={[
                      "mt-0.5 h-1 w-1 rounded-full",
                      isSelected ? "bg-white" : "bg-accent-500",
                    ].join(" ")}
                  />
                ) : (
                  <span aria-hidden className="mt-0.5 h-1 w-1" />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* 選択日の会(カレンダー直下・#2のカードを再利用) or 会ゼロ月の EmptyState */}
      <div className="mt-5 border-t border-line-100 pt-5">
        {!monthHasAny ? (
          <EmptyState glyph="◇" title="この月に会はありません" body={emptyMonthBody} />
        ) : selectedParts && selectedSlots.length > 0 ? (
          <>
            <h3
              className={[
                "font-serif text-[18px]",
                weekdayColorClass(selectedParts.wd),
              ].join(" ")}
            >
              {selectedParts.m}/{selectedParts.d}（{WEEKDAY_HEADERS[selectedParts.wd]}） の会
            </h3>
            <ul className="mt-3 space-y-3">
              {selectedSlots.map((s) => (
                <li key={keyOf(s)}>{renderCard(s)}</li>
              ))}
            </ul>
          </>
        ) : (
          // 月内に会はあるが、選択日には無い場合(自動選択で基本起きないが保険)。
          <p className="font-sans text-[14px] text-ink-500">
            この日に会はありません。開催日（ドットのある日）を選んでください。
          </p>
        )}
      </div>
    </div>
  );
}
