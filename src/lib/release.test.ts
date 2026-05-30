// =============================================================================
// RELEASE_MODE ヘルパの単体テスト (01_s8_spec.md 要望3)。
//   既定 open / "waiting" のときだけ waiting（フェイルオープン）を実証。
//   release.ts は `import "server-only"` するため、node 環境の vitest では
//   server-only をモックする（feedback_vitest-route-testing の流儀）。
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isWaiting, isOpen } from "./release";
import { releaseMode } from "./env";

const ORIGINAL = process.env.RELEASE_MODE;

beforeEach(() => {
  delete process.env.RELEASE_MODE;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.RELEASE_MODE;
  else process.env.RELEASE_MODE = ORIGINAL;
});

describe("releaseMode / isWaiting / isOpen", () => {
  it("未設定なら open（フェイルオープン: 設定漏れで待機画面に固まらない）", () => {
    delete process.env.RELEASE_MODE;
    expect(releaseMode()).toBe("open");
    expect(isOpen()).toBe(true);
    expect(isWaiting()).toBe(false);
  });

  it('"waiting" を明示したときだけ waiting', () => {
    process.env.RELEASE_MODE = "waiting";
    expect(releaseMode()).toBe("waiting");
    expect(isWaiting()).toBe(true);
    expect(isOpen()).toBe(false);
  });

  it('"open" を明示すれば open', () => {
    process.env.RELEASE_MODE = "open";
    expect(releaseMode()).toBe("open");
    expect(isOpen()).toBe(true);
    expect(isWaiting()).toBe(false);
  });

  it("未知の値は open に倒す（waiting と書いたときのみ待機）", () => {
    process.env.RELEASE_MODE = "maintenance";
    expect(releaseMode()).toBe("open");
    expect(isWaiting()).toBe(false);
  });

  it("評価時点の env を読む（モジュール初期化時に固定しない）", () => {
    process.env.RELEASE_MODE = "waiting";
    expect(isWaiting()).toBe(true);
    process.env.RELEASE_MODE = "open";
    expect(isWaiting()).toBe(false);
  });
});
