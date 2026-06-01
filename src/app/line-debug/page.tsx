"use client";

// /line-debug — LINEログインの失敗原因を「実データで」確定するための一時診断ページ。
//
// 使い方:
//   1) スマホLINEで https://liff.line.me/2010236765-saeVnKMD?diag=1 を開く
//      （または通常ログイン後、戻ってきた画面のURLを /line-debug に差し替えて開く）
//   2) このページが liff.init → 各種状態 + URLクエリ(LINEが付けた error 等) を画面表示
//   3) 表示内容をそのまま開発将軍に伝える → 原因確定
//
// 値の安全性: id_token は**先頭12文字 + 長さ**のみ表示（全体は出さない）。
//   profile も displayName のみ。lineUserId 等の生PIIはこのページからサーバに送らない。
// 一時診断用。原因確定後に削除する。

import { useEffect, useState } from "react";

interface Diag {
  step: string;
  liffId: string;
  url: string;
  query: Record<string, string>;
  isInClient?: boolean;
  isLoggedIn?: boolean;
  os?: string;
  idTokenLen?: number;
  idTokenHead?: string;
  accessTokenLen?: number;
  displayName?: string;
  initError?: string;
  exchangeStatus?: number;
  exchangeBody?: string;
}

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID ?? "";

export default function LineDebugPage() {
  const [d, setD] = useState<Diag>({
    step: "start",
    liffId: LIFF_ID || "(NEXT_PUBLIC_LIFF_ID 未設定)",
    url: typeof window !== "undefined" ? window.location.href : "",
    query: {},
  });

  useEffect(() => {
    (async () => {
      const query: Record<string, string> = {};
      if (typeof window !== "undefined") {
        new URLSearchParams(window.location.search).forEach((v, k) => {
          query[k] = v;
        });
      }
      const next: Diag = {
        step: "collecting",
        liffId: LIFF_ID || "(未設定)",
        url: typeof window !== "undefined" ? window.location.href : "",
        query,
      };
      try {
        const liff = (await import("@line/liff")).default;
        next.step = "init";
        await liff.init({ liffId: LIFF_ID });
        next.step = "initialized";
        next.isInClient = liff.isInClient();
        next.isLoggedIn = liff.isLoggedIn();
        try {
          next.os = String(liff.getOS?.() ?? "");
        } catch {
          /* noop */
        }
        if (liff.isLoggedIn()) {
          const idt = liff.getIDToken() ?? "";
          next.idTokenLen = idt.length;
          next.idTokenHead = idt.slice(0, 12);
          try {
            next.accessTokenLen = (liff.getAccessToken() ?? "").length;
          } catch {
            /* noop */
          }
          try {
            const p = await liff.getProfile();
            next.displayName = p.displayName;
          } catch {
            /* noop */
          }
          // サーバ交換も試して status を見る（成功すれば原因はUI側だった証拠）。
          if (idt) {
            try {
              const res = await fetch("/api/auth/line", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idToken: idt }),
                cache: "no-store",
              });
              next.exchangeStatus = res.status;
              next.exchangeBody = (await res.text()).slice(0, 200);
            } catch (e) {
              next.exchangeBody = "fetch error: " + (e instanceof Error ? e.message : "?");
            }
          }
        }
        next.step = "done";
      } catch (e) {
        next.step = "init_failed";
        next.initError = e instanceof Error ? e.message : String(e);
      }
      setD(next);
    })();
  }, []);

  const row = (k: string, v: unknown) => (
    <div style={{ display: "flex", gap: 8, padding: "4px 0", borderBottom: "1px solid #eee" }}>
      <span style={{ minWidth: 130, color: "#888", fontSize: 12 }}>{k}</span>
      <span style={{ fontSize: 12, wordBreak: "break-all" }}>
        {typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}
      </span>
    </div>
  );

  return (
    <main style={{ padding: 16, fontFamily: "monospace", maxWidth: 480 }}>
      <h1 style={{ fontSize: 16, marginBottom: 12 }}>LINE ログイン診断</h1>
      {row("step", d.step)}
      {row("liffId", d.liffId)}
      {row("url", d.url)}
      {row("query", d.query)}
      {row("isInClient", d.isInClient)}
      {row("isLoggedIn", d.isLoggedIn)}
      {row("os", d.os)}
      {row("idToken len", d.idTokenLen)}
      {row("idToken head", d.idTokenHead)}
      {row("accessToken len", d.accessTokenLen)}
      {row("displayName", d.displayName)}
      {row("init error", d.initError)}
      {row("exchange status", d.exchangeStatus)}
      {row("exchange body", d.exchangeBody)}
      <p style={{ fontSize: 11, color: "#aaa", marginTop: 16 }}>
        ※ 一時診断ページ。id_token は先頭12文字のみ表示。原因確定後に削除します。
      </p>
    </main>
  );
}
