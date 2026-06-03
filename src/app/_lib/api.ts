// Client-side API helpers for S1.
//
// Backend may be incomplete during S1. Per task spec, on fetch failure we fall
// back to dummy data SHAPED PER THE CONTRACT (api-contract-s1.md §1/§2) so the
// UI renders production-intended DOM/text/design without a live backend.
// Every fallback is marked with `// FALLBACK` and is easy to delete once the
// backend is wired up.

import type {
  IdDocType,
  IdentityStatus,
  MeResponse,
  ProfileDTO,
} from "./types";

const JSON_HEADERS = { "Content-Type": "application/json" };

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiCallError(res.status, data);
  }
  return (await res.json()) as T;
}

async function putJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiCallError(res.status, data);
  }
  return (await res.json()) as T;
}

export class ApiCallError extends Error {
  status: number;
  code: string | null;
  constructor(status: number, payload: unknown) {
    const code =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      (payload as { error?: { code?: string } }).error?.code
        ? (payload as { error: { code: string } }).error.code
        : null;
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      (payload as { error?: { message?: string } }).error?.message
        ? (payload as { error: { message: string } }).error.message
        : `request failed (${status})`;
    super(message);
    this.name = "ApiCallError";
    this.status = status;
    this.code = code;
  }
}

// --- FALLBACK dummy data (contract-shaped). Delete when backend is live. ---

const FALLBACK_PROFILE: ProfileDTO = {
  displayName: "ハナ",
  gender: "female",
  birthdate: "1996-05-12",
  age: 29,
  areaPref: ["ebisu", "ginza"],
  bio: "週末はカフェ巡りと小さな展示を見にいくのが好きです。落ち着いて話せる方とお会いできたら。",
  photoUrl: null,
  ratingAvg: 4.3,
  ratingCount: 12,
};

const FALLBACK_ME: MeResponse = {
  user: {
    id: "u_demo",
    role: "user",
    status: "active",
    displayName: "ハナ",
  },
  profile: FALLBACK_PROFILE,
  identity: { status: "approved", rejectReason: null },
  canApply: true,
  canApplyReason: null,
};

// --- Public API ---

export async function devLogin(): Promise<{ ok: boolean }> {
  try {
    await postJson<{ user: unknown }>("/api/auth/dev-login", {});
    return { ok: true };
  } catch {
    // FALLBACK: backend not wired — treat dev-login as succeeded so the
    // onboarding flow is reachable for review.
    return { ok: true };
  }
}

export async function getMe(): Promise<MeResponse> {
  try {
    const res = await fetch("/api/me", { cache: "no-store" });
    if (!res.ok) throw new ApiCallError(res.status, await res.json().catch(() => null));
    return (await res.json()) as MeResponse;
  } catch {
    return FALLBACK_ME; // FALLBACK
  }
}

export async function getIdentity(): Promise<{
  status: IdentityStatus;
  rejectReason: string | null;
} | null> {
  try {
    const res = await fetch("/api/identity", { cache: "no-store" });
    if (!res.ok) throw new ApiCallError(res.status, await res.json().catch(() => null));
    return (await res.json()) as {
      status: IdentityStatus;
      rejectReason: string | null;
    } | null;
  } catch {
    // FALLBACK: 未提出(null)を返す。S11 #1: 以前は pending を返していたため、未提出でも
    // 「確認中」と誤表示されていた。バックエンド未接続/未認証時は「未提出」扱いが正しい
    // （確認中の見え方は /identity/status?demo=pending で確認できる）。
    return null;
  }
}

export async function uploadIdentityImage(file: File): Promise<{ blobRef: string }> {
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/identity/upload", {
      method: "POST",
      body: form,
      cache: "no-store",
    });
    if (!res.ok) throw new ApiCallError(res.status, await res.json().catch(() => null));
    return (await res.json()) as { blobRef: string };
  } catch {
    // FALLBACK: dev returns a placeholder ref per contract §0 (Blobモック).
    return { blobRef: `mock-blob-${Date.now()}` };
  }
}

export async function submitIdentity(input: {
  docType: IdDocType;
  blobRef: string;
}): Promise<{ status: "pending" }> {
  try {
    return await postJson<{ status: "pending" }>("/api/identity", input);
  } catch {
    return { status: "pending" }; // FALLBACK
  }
}

export interface ProfileInput {
  displayName: string;
  gender: ProfileDTO["gender"];
  birthdate: string;
  areaPref: ProfileDTO["areaPref"];
  bio?: string;
}

export async function saveProfile(
  input: ProfileInput,
): Promise<{ profile: ProfileDTO }> {
  // No try/catch wrapper here: callers need to distinguish a 400 (e.g.
  // under_age) from a network error to mirror the server-side guard in the UI.
  return putJson<{ profile: ProfileDTO }>("/api/profile", input);
}

export async function uploadProfilePhoto(file: File): Promise<{ photoUrl: string }> {
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/profile/photo", {
      method: "POST",
      body: form,
      cache: "no-store",
    });
    if (!res.ok) throw new ApiCallError(res.status, await res.json().catch(() => null));
    return (await res.json()) as { photoUrl: string };
  } catch {
    // FALLBACK: echo a local object URL so the chosen photo previews in dev.
    return { photoUrl: URL.createObjectURL(file) };
  }
}
