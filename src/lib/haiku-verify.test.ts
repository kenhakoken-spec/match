// =============================================================================
// matching-app — AI(Haiku)本人認証一次判定のテスト(S8 要望2)。
// 決定的モックの ok/review/ng 分岐・18未満の安全弁・determinism・本番throw を検証。
// =============================================================================
import { describe, it, expect, afterEach, vi } from "vitest";

// haiku-verify は "server-only" を import するため node 実行用に空モック。
vi.mock("server-only", () => ({}));

import {
  verifyIdentityImage,
  isMockAiEnabled,
  HaikuVerificationUnavailableError,
} from "./haiku-verify";
import type { IdDocType } from "./types";

// process.env を各テストで復元するためのスナップショット。
const ENV_SNAPSHOT = { ...process.env };

// NODE_ENV は @types/node で読み取り専用に推論されるため Record キャストで書き換える。
function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete (process.env as Record<string, string>)[key];
  else (process.env as Record<string, string>)[key] = value;
}

afterEach(() => {
  process.env = { ...ENV_SNAPSHOT };
});

/** 指定の満年齢になる生年月日(基準=今日)。境界テスト用。 */
function birthdateForAge(age: number): Date {
  const now = new Date();
  return new Date(now.getFullYear() - age, now.getMonth(), now.getDate());
}

const DOC: IdDocType = "drivers_license";

describe("isMockAiEnabled (フェイルクローズ)", () => {
  it("非production・未設定は既定ON", () => {
    setEnv("NODE_ENV", undefined);
    setEnv("MOCK_AI", undefined);
    expect(isMockAiEnabled()).toBe(true);
  });

  it("MOCK_AI=0 を明示すると OFF", () => {
    setEnv("NODE_ENV", undefined);
    setEnv("MOCK_AI", "0");
    expect(isMockAiEnabled()).toBe(false);
  });

  it("production では MOCK_AI の値に関わらず常に OFF(実検証へ)", () => {
    setEnv("NODE_ENV", "production");
    setEnv("MOCK_AI", "1");
    expect(isMockAiEnabled()).toBe(false);
  });
});

describe("verifyIdentityImage — モック判定(ok/review/ng)", () => {
  it("18歳以上・顔写真あり・読取良好 → ok", async () => {
    const r = await verifyIdentityImage({
      docType: DOC,
      blobRef: "blob/clean-passport.jpg",
      birthdate: birthdateForAge(25),
    });
    expect(r.verdict).toBe("ok");
    expect(r.reason).toMatch(/AI\(mock\)/);
  });

  it("画像不鮮明/顔写真なしマーカー → review(運営確認)", async () => {
    const blurry = await verifyIdentityImage({
      docType: DOC,
      blobRef: "blob/blurry-scan.jpg",
      birthdate: birthdateForAge(30),
    });
    expect(blurry.verdict).toBe("review");

    const noface = await verifyIdentityImage({
      docType: DOC,
      blobRef: "blob/noface-doc.jpg",
      birthdate: birthdateForAge(30),
    });
    expect(noface.verdict).toBe("review");

    const unreadable = await verifyIdentityImage({
      docType: DOC,
      blobRef: "blob/unreadable.png",
      birthdate: birthdateForAge(30),
    });
    expect(unreadable.verdict).toBe("review");
  });

  it("18歳未満 → ng(年齢の安全弁。AI段階で弾く)", async () => {
    const r = await verifyIdentityImage({
      docType: DOC,
      blobRef: "blob/clean.jpg",
      birthdate: birthdateForAge(17),
    });
    expect(r.verdict).toBe("ng");
    expect(r.reason).toMatch(/18歳未満/);
  });

  it("ちょうど18歳は ok(境界・成人扱い)", async () => {
    const r = await verifyIdentityImage({
      docType: DOC,
      blobRef: "blob/clean.jpg",
      birthdate: birthdateForAge(18),
    });
    expect(r.verdict).toBe("ok");
  });

  it("18未満は読取不能マーカーがあっても ng が優先(誤って review/ok にしない)", async () => {
    const r = await verifyIdentityImage({
      docType: DOC,
      blobRef: "blob/blurry-and-minor.jpg",
      birthdate: birthdateForAge(15),
    });
    expect(r.verdict).toBe("ng");
  });
});

describe("verifyIdentityImage — 決定性(同入力→同結果)", () => {
  it("同じ入力は常に同じ verdict/reason を返す(乱数なし)", async () => {
    const input = {
      docType: DOC,
      blobRef: "blob/same.jpg",
      birthdate: birthdateForAge(28),
    };
    const a = await verifyIdentityImage(input);
    const b = await verifyIdentityImage(input);
    const c = await verifyIdentityImage(input);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("reason に画像参照(blobRef)・秘密値を含めない(漏洩防止)", async () => {
    const secretBlob = "blob/SECRET-TOKEN-abc123-passport.jpg";
    const r = await verifyIdentityImage({
      docType: DOC,
      blobRef: secretBlob,
      birthdate: birthdateForAge(40),
    });
    expect(r.reason).not.toContain(secretBlob);
    expect(r.reason).not.toContain("SECRET-TOKEN");
    expect(r.reason).not.toContain("abc123");
  });
});

describe("verifyIdentityImage — 本番(モック無効)は実検証未実装で throw", () => {
  it("production では HaikuVerificationUnavailableError(モックへ落とさない)", async () => {
    setEnv("NODE_ENV", "production");
    setEnv("MOCK_AI", undefined);
    await expect(
      verifyIdentityImage({
        docType: DOC,
        blobRef: "blob/clean.jpg",
        birthdate: birthdateForAge(25),
      })
    ).rejects.toBeInstanceOf(HaikuVerificationUnavailableError);
  });

  it("503 ステータスコードを持つ(route で 503 に変換できる)", async () => {
    setEnv("NODE_ENV", "production");
    setEnv("MOCK_AI", undefined);
    try {
      await verifyIdentityImage({
        docType: DOC,
        blobRef: "blob/clean.jpg",
        birthdate: birthdateForAge(25),
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as HaikuVerificationUnavailableError).status).toBe(503);
      expect((err as HaikuVerificationUnavailableError).code).toBe(
        "ai_verification_unavailable"
      );
    }
  });
});
