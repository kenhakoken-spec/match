#!/usr/bin/env bash
#
# launch_dev_shogun.sh — マッチングアプリ 開発将軍 起動スクリプト
#
# 【重要】このスクリプトは「親将軍（multi-agent-shogun の Shogun）」が実行する。
#          開発将軍自身や Worker が実行してはならない。起動権限は親将軍にある。
#
# 役割: shogun セッション内に専用ウィンドウ "dev-shogun" を開き、
#       /mnt/c/tools/matching-app を作業ディレクトリとして claude を起動する。
#       起動された Claude は CLAUDE.md の MANDATORY First Action に従い
#       自己同定し、instructions/dev_shogun.md を読んで開発将軍として動き出す。
#
# 前提:
#   - tmux セッション "shogun" が存在すること
#   - claude CLI が PATH 上にあること
#   - /mnt/c/tools/matching-app/.claude/settings.json により
#     model=claude-opus-4-8[1m] / effort=max / Agent Teams=1 が自動適用される
#
set -euo pipefail

PROJECT_DIR="/mnt/c/tools/matching-app"
SESSION="shogun"
WINDOW="dev-shogun"

# セッション存在チェック
if ! tmux has-session -t "${SESSION}" 2>/dev/null; then
  echo "ERROR: tmux session '${SESSION}' が存在しません。先に親将軍セッションを起動してください。" >&2
  exit 1
fi

# 既存の同名ウィンドウがあれば警告して中断（二重起動防止）
if tmux list-windows -t "${SESSION}" -F '#{window_name}' 2>/dev/null | grep -qx "${WINDOW}"; then
  echo "ERROR: ウィンドウ '${WINDOW}' は既に存在します。二重起動を防止するため中断します。" >&2
  exit 1
fi

# 開発将軍を新規ウィンドウで起動
tmux new-window -t "${SESSION}" -n "${WINDOW}" -c "${PROJECT_DIR}" 'claude'

echo "OK: '${SESSION}:${WINDOW}' に開発将軍を起動しました（cwd=${PROJECT_DIR}）。"
