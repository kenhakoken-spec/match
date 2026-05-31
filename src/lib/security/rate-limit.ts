// =============================================================================
// SEC-004 レート制限: 固定窓(fixed window)カウンタ。純ロジック + 判定関数を分離。
//
// ストアは globalThis.__mappRateLimit に保持（プロセス内のみ）。
// NOTE: in-memory のためマルチインスタンス本番では正しく効かない。
//   本番(複数 Vercel Lambda/Edge インスタンス)では Redis 等の共有ストアへ
//   差し替えること。ここではプロセス内の濫用緩和（DoS/連打）に留まる。
//
// middleware から呼ばれるが Edge API には依存しない（Map と Date のみ）。
// =============================================================================

/** レート制限カテゴリ。パスから分類する。 */
export type RateLimitCategory =
  | "auth"
  | "identity"
  | "venues_suggest"
  | "slots_apply"
  | "default";

/** カテゴリ別の上限（固定窓 60 秒あたりの最大リクエスト数）。 */
export const RATE_LIMITS: Record<RateLimitCategory, number> = {
  auth: 20, // /api/auth/ ... ログイン連打/総当たり対策
  identity: 10, // /api/identity(upload含む) ... AI判定コスト/濫用対策
  venues_suggest: 10, // /api/admin/venues/suggest ... 外部/AI呼び出しコスト
  slots_apply: 30, // /api/slots/[id]/apply ... 応募連打
  default: 120, // その他 /api/
};

/** 固定窓の長さ(ミリ秒)。 */
export const WINDOW_MS = 60_000;

/** 1 キーの固定窓カウンタ。 */
interface WindowState {
  count: number;
  /** 窓の開始時刻(ms epoch)。now - windowStart >= WINDOW_MS で窓をリセット。 */
  windowStart: number;
}

type RateLimitStore = Map<string, WindowState>;

// globalThis にストアを保持（dev の HMR / 同一プロセス内の複数 import で共有）。
const STORE_KEY = "__mappRateLimit";

interface GlobalWithStore {
  [STORE_KEY]?: RateLimitStore;
}

function getStore(): RateLimitStore {
  const g = globalThis as unknown as GlobalWithStore;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = new Map<string, WindowState>();
  }
  return g[STORE_KEY]!;
}

/**
 * パスからレート制限カテゴリを判定する純関数。
 * 具体的なパス(suggest/apply)を一般カテゴリ(identity/auth)より先に評価する。
 */
export function categorize(pathname: string): RateLimitCategory {
  // 具体パス優先。
  if (pathname === "/api/admin/venues/suggest") return "venues_suggest";
  // /api/slots/{id}/apply（{id} は任意セグメント）。
  if (/^\/api\/slots\/[^/]+\/apply\/?$/.test(pathname)) return "slots_apply";
  // 認証系。
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) {
    return "auth";
  }
  // 本人確認系（/api/identity, /api/identity/upload 等。admin 配下の identity 審査は別＝default）。
  if (pathname === "/api/identity" || pathname.startsWith("/api/identity/")) {
    return "identity";
  }
  return "default";
}

/** クライアント識別子(IP)を x-forwarded-for → x-real-ip → "unknown" で解決する純関数。 */
export function clientIp(
  forwardedFor: string | null,
  realIp: string | null
): string {
  if (forwardedFor) {
    // "client, proxy1, proxy2" の先頭がオリジンクライアント。
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  if (realIp && realIp.trim()) return realIp.trim();
  return "unknown";
}

/** レート制限キー = IP + カテゴリ。カテゴリごとに独立した窓を持たせる。 */
export function rateLimitKey(ip: string, category: RateLimitCategory): string {
  return `${ip}::${category}`;
}

export interface RateLimitResult {
  /** true なら許可、false なら 429。 */
  allowed: boolean;
  /** 適用された上限。 */
  limit: number;
  /** 現在の窓での消費数（このリクエスト込み。拒否時は上限+越えぶん）。 */
  used: number;
  /** 窓内の残り許可数（拒否時は 0）。 */
  remaining: number;
  /** 窓リセットまでの秒数（Retry-After 用、切り上げ）。 */
  retryAfterSec: number;
}

/**
 * 純粋な固定窓判定。state を受け取り、次状態と結果を返す（副作用なし）。
 * テストでストアに依存せず境界条件を検証できるよう分離。
 *
 * @returns { nextState, result }
 */
export function decideFixedWindow(
  prev: WindowState | undefined,
  limit: number,
  now: number
): { nextState: WindowState; result: RateLimitResult } {
  // 窓が無い or 窓が満了 → 新しい窓を開始。
  if (!prev || now - prev.windowStart >= WINDOW_MS) {
    const nextState: WindowState = { count: 1, windowStart: now };
    return {
      nextState,
      result: {
        allowed: true,
        limit,
        used: 1,
        remaining: Math.max(0, limit - 1),
        retryAfterSec: Math.ceil(WINDOW_MS / 1000),
      },
    };
  }

  // 既存窓内。
  const elapsed = now - prev.windowStart;
  const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - elapsed) / 1000));

  if (prev.count >= limit) {
    // 上限到達 → 拒否（カウントは増やさない＝窓内の正規上限を保つ）。
    return {
      nextState: prev,
      result: {
        allowed: false,
        limit,
        used: prev.count,
        remaining: 0,
        retryAfterSec,
      },
    };
  }

  const count = prev.count + 1;
  const nextState: WindowState = { count, windowStart: prev.windowStart };
  return {
    nextState,
    result: {
      allowed: true,
      limit,
      used: count,
      remaining: Math.max(0, limit - count),
      retryAfterSec,
    },
  };
}

/**
 * ストアに対してレート制限を 1 回適用する（副作用あり）。middleware から呼ぶ高水準 API。
 *
 * @param key       rateLimitKey() で作ったキー
 * @param limit     カテゴリ上限
 * @param now       現在時刻(ms)。既定 Date.now()。テストで固定可能。
 */
export function consume(
  key: string,
  limit: number,
  now: number = Date.now()
): RateLimitResult {
  const store = getStore();
  const { nextState, result } = decideFixedWindow(store.get(key), limit, now);
  store.set(key, nextState);
  return result;
}

/**
 * パス + IP ヘッダからカテゴリ判定 → consume までを一括で行う便宜関数。
 * Bearer トリガー / webhook の除外は呼び出し側(middleware)で判断する
 * （ここはレート制限ロジックに専念。除外は origin.ts と同じ判定器を再利用）。
 */
export function applyRateLimit(args: {
  pathname: string;
  forwardedFor: string | null;
  realIp: string | null;
  now?: number;
}): RateLimitResult & { category: RateLimitCategory; key: string } {
  const category = categorize(args.pathname);
  const ip = clientIp(args.forwardedFor, args.realIp);
  const key = rateLimitKey(ip, category);
  const limit = RATE_LIMITS[category];
  const result = consume(key, limit, args.now ?? Date.now());
  return { ...result, category, key };
}

/** テスト用: ストアを空にする。各テストの独立性を保つため afterEach 等で呼ぶ。 */
export function resetRateLimitForTest(): void {
  getStore().clear();
}
