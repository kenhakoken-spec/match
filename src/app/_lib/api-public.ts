// src/app/_lib/api-public.ts — S8 公開(プレビュー)API クライアント (要望1).
//
// 認証なしで叩ける公開エンドポイント。`credentials:"omit"` で資格情報を送らない
// (集客のため未ログインに見せる)。レスポンスは構造上 PII を含まない
// (PublicSlotDTO / PublicMemberDTO: 氏名/写真/lineUserId は無い)。
//
// 一覧は backend が { slots: PublicSlotDTO[] } で包んで返す(api/public/slots/route.ts)。
// 詳細は PublicSlotDetailDTO を直接返す(api/public/slots/[id]/route.ts、404 は slot_not_found)。
// 他の S2 クライアント(api-s2.ts)同様、取得失敗時は契約準拠のダミーへ FALLBACK し、
// バックエンド未接続でも全UI状態がレビューできるようにする(各所 `// FALLBACK`)。

import type { PublicSlotDTO, PublicSlotDetailDTO } from "@/lib/types";
import { atJstTime } from "./relative-date";

export class PublicApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PublicApiError";
    this.status = status;
  }
}

async function getPublic<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    method: "GET",
    // 公開エンドポイント。資格情報は送らない(未ログインで動くことが要件)。
    credentials: "omit",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new PublicApiError(res.status, `GET ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

// ---- FALLBACK ダミー(契約準拠)。バックエンド本接続時に削除可。 ----
// 「誰でもOK」「20代限定」「優良バッジ限定」の3種を含め、条件バッジ表示を一通り確認できる。
// 日付は「今から数日後」の相対生成（陳腐化防止 / s9_spec §4）。19:30 集合の雰囲気は維持。
function fbPublicSlots(): PublicSlotDTO[] {
  return [
    {
      id: "pub_ebisu_01",
      datetimeStart: atJstTime(4, 19, 30),
      area: "ebisu",
      capacityPerGender: 3,
      capacityTotal: 6,
      minPerGender: 2,
      maxPerGender: 4,
      filled: { male: 1, female: 2 },
      conditions: { minAge: null, maxAge: null, requiresBadge: null },
      feeMale: 2000,
      status: "open",
    },
    {
      id: "pub_ikebukuro_20s",
      datetimeStart: atJstTime(8, 19, 30),
      area: "ikebukuro",
      capacityPerGender: 3,
      capacityTotal: 6,
      minPerGender: 2,
      maxPerGender: 4,
      filled: { male: 2, female: 1 },
      conditions: { minAge: 20, maxAge: 29, requiresBadge: null },
      feeMale: 2000,
      status: "open",
    },
    {
      id: "pub_ginza_premium",
      datetimeStart: atJstTime(11, 19, 30),
      area: "ginza",
      capacityPerGender: 3,
      capacityTotal: 6,
      minPerGender: 2,
      maxPerGender: 4,
      filled: { male: 2, female: 2 },
      conditions: { minAge: null, maxAge: null, requiresBadge: "premium" },
      feeMale: 2000,
      status: "open",
    },
  ];
}

function fallbackPublicDetail(id: string): PublicSlotDetailDTO {
  const slots = fbPublicSlots();
  const base = slots.find((s) => s.id === id) ?? slots[0];
  return {
    ...base,
    members: [
      {
        ageBand: "20代後半",
        gender: "female",
        occupation: "creative",
        ratings: { again: 4.6, talk: 4.4, manner: 4.8, overall: 4.6, count: 9 },
        hasPremiumBadge: true,
      },
      {
        ageBand: "30代前半",
        gender: "male",
        occupation: "it",
        ratings: { again: 4.2, talk: 4.0, manner: 4.3, overall: 4.2, count: 5 },
        hasPremiumBadge: false,
      },
      {
        ageBand: "20代前半",
        gender: "female",
        occupation: "company_employee",
        ratings: { again: 0, talk: 0, manner: 0, overall: 0, count: 0 },
        hasPremiumBadge: false,
      },
    ],
  };
}

// GET /api/public/slots -> { slots: PublicSlotDTO[] }（昇順）。
export async function fetchPublicSlots(): Promise<PublicSlotDTO[]> {
  try {
    const data = await getPublic<{ slots: PublicSlotDTO[] }>("/api/public/slots");
    return data.slots;
  } catch {
    return fbPublicSlots(); // FALLBACK
  }
}

// GET /api/public/slots/[id] -> PublicSlotDetailDTO（404 は notFound:true で返す）。
export async function fetchPublicSlotDetail(
  id: string,
): Promise<{ detail: PublicSlotDetailDTO | null; notFound: boolean }> {
  try {
    const detail = await getPublic<PublicSlotDetailDTO>(
      `/api/public/slots/${encodeURIComponent(id)}`,
    );
    return { detail, notFound: false };
  } catch (e) {
    if (e instanceof PublicApiError && e.status === 404) {
      return { detail: null, notFound: true };
    }
    // FALLBACK: ネットワーク等の失敗は契約準拠ダミーでUIを成立させる。
    return { detail: fallbackPublicDetail(id), notFound: false };
  }
}
