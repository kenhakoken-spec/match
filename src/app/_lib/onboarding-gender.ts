// src/app/_lib/onboarding-gender.ts — オンボーディングで先行入力した性別の一時保持。
//
// s9 §4.4: 性別は Profile.gender が最終的に正。だが料金UIが性別依存(s9 §5)のため、
// オンボ第1ステップで取得した値を sessionStorage に一時保持し、プロフィール登録
// (/profile/new)の性別2択の初期選択に流し込む。Profile 作成後は Profile.gender が真。
//
// sessionStorage を使う理由: タブを閉じれば消える短命データで十分(永続不要)。
// SSR/非対応環境では安全に no-op / null を返す。

import type { Gender } from "./types";

const KEY = "hakoniwa.onboarding.gender";

export function setOnboardingGender(gender: Gender): void {
  try {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(KEY, gender);
  } catch {
    // storage 無効(プライベートモード等)でもオンボは続行できるよう握りつぶす。
  }
}

export function getOnboardingGender(): Gender | null {
  try {
    if (typeof window === "undefined") return null;
    const v = window.sessionStorage.getItem(KEY);
    return v === "male" || v === "female" ? v : null;
  } catch {
    return null;
  }
}

export function clearOnboardingGender(): void {
  try {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}
