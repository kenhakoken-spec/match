"use client";

// A-10 (admin) — 優良バッジ付与状況 + 手動付与/取消。
// 契約: api-contract-s6.md §2 (GET /api/admin/badges, POST grant/revoke{userId})。
// design-system §7 (admin は PC 想定・別途簡素に) / §4.7 E (優良バッジは trust 系・
// 金ピカ/煽り禁止) / §1.6 (状態は色だけに頼らずラベル+形状)。
//
// 所有: frontend (S6)。backend (route/service/repo) は読み取り API として消費するのみ。
// バッジ判定・付与の副作用は backend (badge-service) 側。ここは表示と操作の窓口。

import { useEffect, useState } from "react";
import { PremiumBadge } from "@/components/ui/StatusPill";
import {
  fetchAdminBadges,
  grantBadge,
  revokeBadge,
  type AdminBadgeRowDTO,
  type BadgeMutationOutcome,
} from "@/app/_lib/api-badge";

// ISO8601 → "2026-05-28 11:00" 程度の素朴な表示 (admin 用・JST 前提)。
function formatGrantedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// grantedBy: "system"=自動付与 / それ以外=手動 (admin userId)。監査表示は形状+ラベルで。
function GrantSource({ grantedBy }: { grantedBy: string | null }) {
  const isSystem = grantedBy === "system";
  return (
    <span className="inline-flex items-center gap-1 font-sans text-[12px] text-ink-500">
      <span aria-hidden>{isSystem ? "◇" : "✎"}</span>
      {isSystem ? "自動付与" : "手動付与"}
    </span>
  );
}

export default function AdminBadgesPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AdminBadgeRowDTO[]>([]);
  const [grantId, setGrantId] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // 進行中の userId ("__grant__"=付与フォーム)
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  async function reload() {
    const items = await fetchAdminBadges();
    setRows(items);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    fetchAdminBadges().then((items) => {
      if (!active) return;
      setRows(items);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  function describe(outcome: BadgeMutationOutcome): { tone: "ok" | "warn"; text: string } {
    if (!outcome.ok) {
      const reason =
        outcome.errorCode === "user_not_found"
          ? "該当するユーザーが見つかりませんでした。"
          : outcome.errorMessage || "処理できませんでした。";
      return { tone: "warn", text: reason };
    }
    switch (outcome.result?.outcome) {
      case "granted":
        return { tone: "ok", text: "優良バッジを付与しました。" };
      case "already":
        return { tone: "ok", text: "すでに付与済みです (変更なし)。" };
      case "revoked":
        return { tone: "ok", text: "優良バッジを取り消しました。" };
      case "absent":
        return { tone: "ok", text: "もともと付与されていませんでした (変更なし)。" };
      default:
        return { tone: "ok", text: "完了しました。" };
    }
  }

  async function onGrant() {
    const id = grantId.trim();
    if (!id || busy) return;
    setBusy("__grant__");
    setNotice(null);
    const outcome = await grantBadge(id);
    setNotice(describe(outcome));
    if (outcome.ok) {
      setGrantId("");
      await reload();
    }
    setBusy(null);
  }

  async function onRevoke(userId: string) {
    if (busy) return;
    setBusy(userId);
    setNotice(null);
    const outcome = await revokeBadge(userId);
    setNotice(describe(outcome));
    if (outcome.ok) {
      await reload();
    }
    setBusy(null);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-6">
      <header className="mb-5">
        <h1 className="font-serif text-[22px] text-ink-900">バッジ付与状況</h1>
        <p className="mt-1 font-sans text-[13px] text-ink-500">
          優良バッジは自動付与 (高評価での参加基準を満たした方) が基本です。例外対応として手動の付与・取消ができます。
        </p>
      </header>

      {/* 手動付与フォーム。userId を直接指定して付与する (例外運用)。 */}
      <section className="mb-6 rounded-md border border-line-200 bg-bg-surface p-4">
        <h2 className="font-sans text-[14px] font-bold text-ink-900">手動で付与する</h2>
        <p className="mt-1 font-sans text-[12px] text-ink-500">
          対象ユーザーの ID を入力してください。すでに付与済みの場合は何も起きません (冪等)。
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="grant-user-id" className="sr-only">
            ユーザーID
          </label>
          <input
            id="grant-user-id"
            type="text"
            inputMode="text"
            autoComplete="off"
            value={grantId}
            onChange={(e) => setGrantId(e.target.value)}
            placeholder="ユーザーID (cuid)"
            className="h-12 flex-1 rounded-sm border border-line-200 bg-bg-surface px-3 font-sans text-[14px] text-ink-900 placeholder:text-ink-300 focus:border-accent-500 focus:outline-none"
          />
          <button
            type="button"
            data-testid="badge-grant"
            onClick={onGrant}
            disabled={!grantId.trim() || busy !== null}
            aria-disabled={!grantId.trim() || busy !== null || undefined}
            className={[
              "inline-flex h-12 items-center justify-center rounded-md px-5 font-sans text-[13px] font-semibold tracking-[0.02em] transition-colors",
              !grantId.trim() || busy !== null
                ? "cursor-not-allowed bg-bg-sunken text-ink-300"
                : "bg-accent-600 text-white hover:bg-accent-600/90",
            ].join(" ")}
          >
            {busy === "__grant__" ? "付与中…" : "付与する"}
          </button>
        </div>
      </section>

      {/* 操作結果の通知。成功=穏当な緑、失敗=warn (赤エラーで責めない・§4.7)。 */}
      {notice ? (
        <div
          role="status"
          aria-live="polite"
          className={[
            "mb-4 rounded-md border px-4 py-3 font-sans text-[13px]",
            notice.tone === "ok"
              ? "border-secondary-500/40 bg-secondary-100 text-secondary-500"
              : "border-state-warn/45 bg-[#F7EFD9] text-state-warn",
          ].join(" ")}
        >
          <span aria-hidden className="mr-1.5">
            {notice.tone === "ok" ? "✓" : "⚠"}
          </span>
          {notice.text}
        </div>
      ) : null}

      {/* 付与状況一覧。 */}
      <section>
        <h2 className="mb-2 font-sans text-[14px] font-bold text-ink-900">
          付与済みの一覧
        </h2>

        {loading ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-center gap-2 rounded-md border border-line-200 bg-bg-surface px-6 py-12 text-center"
          >
            <span
              aria-hidden
              className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-line-200 border-t-accent-500"
            />
            <span className="font-sans text-[13px] text-ink-500">読み込んでいます</span>
          </div>
        ) : rows.length === 0 ? (
          <div
            data-testid="admin-badge-list"
            className="rounded-md border border-line-200 bg-bg-surface px-6 py-12 text-center"
          >
            <p className="font-sans text-[14px] text-ink-700">
              まだ優良バッジを付与されたユーザーはいません。
            </p>
            <p className="mt-1 font-sans text-[12px] text-ink-500">
              基準を満たした方には評価確定時に自動で付与されます。
            </p>
          </div>
        ) : (
          <ul
            data-testid="admin-badge-list"
            className="overflow-hidden rounded-md border border-line-200 bg-bg-surface"
          >
            {rows.map((row, i) => {
              const rowBusy = busy === row.userId;
              return (
                <li
                  key={row.userId}
                  className={[
                    "flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3",
                    i > 0 ? "border-t border-line-100" : "",
                  ].join(" ")}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-sans text-[14px] text-ink-900">
                        {row.displayName ?? "(表示名なし)"}
                      </span>
                      <PremiumBadge />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-[12px] text-ink-500">
                        {row.userId}
                      </span>
                      <GrantSource grantedBy={row.grantedBy} />
                      <span className="font-sans text-[12px] tabular-nums text-ink-500">
                        {formatGrantedAt(row.grantedAt)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid="badge-revoke"
                    onClick={() => onRevoke(row.userId)}
                    disabled={busy !== null}
                    aria-disabled={busy !== null || undefined}
                    className={[
                      "inline-flex h-10 shrink-0 items-center justify-center rounded-md px-4 font-sans text-[13px] font-semibold transition-colors",
                      busy !== null
                        ? "cursor-not-allowed text-ink-300"
                        : "text-state-danger hover:bg-bg-sunken",
                    ].join(" ")}
                  >
                    {rowBusy ? "取消中…" : "取り消す"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
