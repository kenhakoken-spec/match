// LINE Login チャネル作成フォームの入力要素を列挙（name/type/placeholder/周辺ラベル/現在値）。
import { chromium } from "playwright";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.newPage());

const data = await page.evaluate(() => {
  const out = [];
  const els = Array.from(document.querySelectorAll("input, textarea, select, button"));
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue; // 不可視は除外
    // 近傍ラベル推定
    let label = "";
    if (el.id) {
      const l = document.querySelector(`label[for="${el.id}"]`);
      if (l) label = l.innerText.trim();
    }
    if (!label) {
      // 親をたどって最初のテキストっぽいものを拾う
      let p = el.closest("div,section,li,fieldset");
      for (let i = 0; i < 3 && p; i++) {
        const t = (p.querySelector("label,legend,h3,h4,p,span")?.innerText || "").trim();
        if (t && t.length < 80) { label = t; break; }
        p = p.parentElement;
      }
    }
    out.push({
      tag: el.tagName.toLowerCase(),
      type: el.type || "",
      name: el.name || "",
      placeholder: el.placeholder || "",
      checked: el.type === "checkbox" ? el.checked : undefined,
      value: (el.tagName === "SELECT" || el.type === "text" || el.type === "email") ? (el.value || "").slice(0, 40) : undefined,
      text: el.tagName === "BUTTON" ? (el.innerText || "").trim().slice(0, 30) : undefined,
      label: label.slice(0, 60),
      options: el.tagName === "SELECT" ? Array.from(el.options).map(o => o.text).slice(0, 12) : undefined,
    });
  }
  return out;
});
console.log(JSON.stringify(data, null, 1));
await b.close();
