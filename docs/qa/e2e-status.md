# E2E 検証ステータス（開発将軍記録）

## S1+S2 機能検証の到達点（2026-05-30）

| レベル | 内容 | 結果 | 実証 |
|--------|------|------|------|
| Lv1 構文 | tsc / vitest / build | ✅ PASS | tsc rc0, **vitest 77 passed(63+14)**, next build BUILD_ID取得 |
| Lv2 実動作 | backend API curl 全フロー | ✅ PASS | dev-login→me(canApply false)→profile(18+,17歳400)→identity→admin approve(blobRef=null)→me(canApply true)→slots→apply 200→二重409→20代限定31歳409→非admin 403→未ログイン401 |
| Lv3 デプロイ | build成果物・全ルート起動 | ✅ PASS | `.next/BUILD_ID`生成、warmupで主要ルートすべて200 |
| Lv4 E2E(UI通し) | Playwright フルチェーン | ⚠️ 環境制約・S7で再挑戦 | 下記 |

## Lv4 E2E の状況（正直な記録）

- **ブラウザ駆動フルチェーンE2EはWSL環境で不安定**（複数回試行）。`Target/context closed`、next dev のオンデマンドコンパイルtimeout が断続。**アプリの欠陥ではない**：
  - 同一UIに対し curl/warmup は全ルート200、個別画面SSは実データ描画を確認済み。
  - 自己完結スモークで login→profile→identity提出→(admin approve) の準備フェーズは通過。落ちるのはブラウザ脚のみ。
- 副産物: `npm start`(本番モード)で **dev-loginが404** = **SEC-001修正が正しく作動**（本番で開発バックドアが塞がれている）。E2Eは `next dev` で実施する必要あり。

## 環境制約（最重要・運用ルール）
- **Bashで `pkill`/`fuser` 等のシグナル送信コマンドは、この環境では常に exit 144 を返し、同一ツールバッチの他の呼び出しを巻き添えキャンセルする。さらに単独でも 144。** → **プロセスkillコマンドは原則打たない**（孤児 dev server はセッション終了で消える・実害なし）。dev serverを使う検証は worker 内の自己完結スクリプトに閉じ込め、kill もそのスクリプト内で `|| true` する。
- WSL `/mnt/c`(DrvFs): next build が稀にENOENT flaky（rm -rf .next で再試行）。
- next dev: ルート初回コンパイルが数秒〜十数秒（E2Eはwarmup＋長timeout）。

## 方針
- S1/S2は Lv1–Lv3 ＋ 個別SS（実データ）＋ E2E準備フェーズ通過 をもって**機能的に完了**と判断し先へ進む。
- **S7 総合QAで本番ビルド＋seed承認済ユーザー方式でフルチェーンE2Eを最終再挑戦**（testid 16個整備済み）。
