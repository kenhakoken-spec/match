"use client";

// /line-debug — LINEログイン診断（強化版）。各項目にラベルを明示し、
// 「ログイン実行」ボタンで liff.login() を発火→戻り後の状態を観測できる。
// 値の安全性: id_token は先頭12文字+長さのみ。生PIIはサーバに送らない。一時診断用。

import { useEffect, useState } from "react";

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID ?? "";

export default function LineDebugPage() {
  const [lines, setLines] = useState<Array<[string, string]>>([]);
  const [liffRef, setLiffRef] = useState<unknown>(null);

  useEffect(() => {
    (async () => {
      const push = (k: string, v: unknown) =>
        setLines((p) => [...p, [k, typeof v === "object" ? JSON.stringify(v) : String(v ?? "")]]);

      const query: Record<string, string> = {};
      if (typeof window !== "undefined")
        new URLSearchParams(window.location.search).forEach((v, k) => (query[k] = v));

      push("NEXT_PUBLIC_LIFF_ID", LIFF_ID || "(未設定!)");
      push("current URL", typeof window !== "undefined" ? window.location.href : "");
      push("URL query", query);

      try {
        const liff = (await import("@line/liff")).default;
        setLiffRef(liff);
        push("import @line/liff", "ok");
        try {
          await liff.init({ liffId: LIFF_ID });
          push("liff.init", "SUCCESS");
        } catch (e) {
          push("liff.init", "FAILED: " + (e instanceof Error ? e.message : String(e)));
          return;
        }
        push("isInClient (LINEアプリ内か)", liff.isInClient());
        push("isLoggedIn", liff.isLoggedIn());
        try {
          push("getOS", String(liff.getOS?.() ?? ""));
        } catch {}
        try {
          push("getVersion", String(liff.getVersion?.() ?? ""));
        } catch {}
        try {
          push("getLineVersion", String(liff.getLineVersion?.() ?? ""));
        } catch {}

        if (liff.isLoggedIn()) {
          const idt = liff.getIDToken() ?? "";
          push("idToken len", idt.length);
          push("idToken head", idt.slice(0, 12));
          if (idt) {
            try {
              const res = await fetch("/api/auth/line", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idToken: idt }),
                cache: "no-store",
              });
              push("exchange status", res.status);
              push("exchange body", (await res.text()).slice(0, 200));
            } catch (e) {
              push("exchange", "fetch err " + (e instanceof Error ? e.message : "?"));
            }
          }
        } else {
          push("→ 次の操作", "下の「ログイン実行」を押す");
        }
      } catch (e) {
        push("FATAL", e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  async function doLogin() {
    const liff = liffRef as { login?: (o?: unknown) => void } | null;
    if (liff?.login) liff.login();
  }

  return (
    <main style={{ padding: 16, fontFamily: "monospace", maxWidth: 520 }}>
      <h1 style={{ fontSize: 16, marginBottom: 12 }}>LINE ログイン診断 v2</h1>
      {lines.map(([k, v], i) => (
        <div
          key={i}
          style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid #eee" }}
        >
          <span style={{ minWidth: 150, color: "#888", fontSize: 12 }}>{k}</span>
          <span style={{ fontSize: 12, wordBreak: "break-all" }}>{v}</span>
        </div>
      ))}
      <button
        onClick={doLogin}
        style={{
          marginTop: 16,
          padding: "10px 16px",
          background: "#C2703D",
          color: "#fff",
          border: 0,
          borderRadius: 6,
          fontSize: 14,
        }}
      >
        ログイン実行 (liff.login)
      </button>
      <p style={{ fontSize: 11, color: "#aaa", marginTop: 12 }}>
        ボタンを押す→LINE同意→このページに戻る。戻ったら上の「URL query」と「isLoggedIn」を確認。
        id_token は先頭12文字のみ表示。原因確定後に削除します。
      </p>
    </main>
  );
}
