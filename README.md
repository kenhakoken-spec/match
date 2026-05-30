# matching-app

マッチングアプリの新規開発プロジェクト。
専任の **開発将軍（Dev-Shogun）** が、Agent Teams 体制で専門Workerに並列委任しながら開発を指揮する。

## 体制

```
殿 → 開発将軍（Dev-Shogun）→ Workers（Agent Teams）
                              ├── frontend-worker    (UI実装)
                              ├── backend-worker     (API/DB/認証/マッチングロジック)
                              ├── design-worker      (UI/UX設計)
                              ├── qa-worker          (テスト作成・実行)
                              ├── qa-tester          (ランダムQA)
                              └── security-reviewer  (セキュリティ・個人情報保護)
```

- 開発将軍の指示書: `instructions/dev_shogun.md`
- Worker 定義: `.claude/agents/*.md`
- ブート設定: `CLAUDE.md`（自己同定 → 指示書読込 → 殿への要件ヒアリング）
- ランタイム設定: `.claude/settings.json`（model=claude-opus-4-8[1m] / effort=max / Agent Teams=1）

## 最初の動き

開発将軍は実装より先に、殿へ次の5項目をヒアリングする:
1. マッチングの対象ドメイン（恋愛/ビジネス/スキル/趣味/その他）
2. 主要機能（プロフィール/検索/マッチングロジック/チャット/通知/課金）
3. 収益化モデルとターゲット規模
4. プラットフォーム（Web/モバイル/両方）とデプロイ先
5. 開発の優先度（MVP最速/機能網羅/デザイン重視）

技術スタックは殿から「おまかせ」を得ており、ヒアリング後に開発将軍が最適提案・方針承認のうえ確定する。

## 起動方法

開発将軍は親将軍（multi-agent-shogun の Shogun）が起動する。

```bash
# 親将軍が実行する（開発将軍/Worker は実行しない）
bash /mnt/c/tools/matching-app/launch_dev_shogun.sh
```

これにより tmux セッション `shogun` 内に `dev-shogun` ウィンドウが開き、
本ディレクトリを cwd として開発将軍が起動する。

## 独立プロジェクト

これは親プロジェクト（multi-agent-shogun）とは**別の git リポジトリ**である。
開発将軍・Worker は親プロジェクトのファイルに一切触れない。
