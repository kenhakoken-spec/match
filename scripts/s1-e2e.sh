#!/usr/bin/env bash
# =============================================================================
# matching-app S1 — curl E2E 実証スクリプト
# 契約のフロー (a)〜(f) + 18歳未満400 + admin無認可403 + IDOR を実出力で示す。
#
# 使い方:
#   1) 別ターミナルで: cd /mnt/c/tools/matching-app && npm run dev
#      (または本スクリプトに任せず手動起動)
#   2) bash scripts/s1-e2e.sh
#   後始末: pkill -f "next dev"
#
# 既定で全モック(MOCK_AUTH/MOCK_DB/MOCK_NOTIFY)。seed: admin / male(approved) / female。
# =============================================================================
set -u
BASE="${BASE:-http://localhost:3000}"
CJ_USER="$(mktemp)"   # 一般ユーザーの cookie jar
CJ_USER2="$(mktemp)"  # 別の一般ユーザー(IDOR確認用)
CJ_ADMIN="$(mktemp)"  # admin の cookie jar
hr(){ echo "------------------------------------------------------------"; }
# status とボディを両方表示するヘルパ
req(){
  # $1=method $2=path $3=cookiejar (rw) 残り=curl追加引数
  local method="$1" path="$2" jar="$3"; shift 3
  echo ">>> ${method} ${path}"
  curl -sS -o /tmp/_body.$$ -w "HTTP %{http_code}\n" \
    -X "${method}" "${BASE}${path}" -b "${jar}" -c "${jar}" "$@"
  echo "RESP: $(cat /tmp/_body.$$)"
  hr
}

echo "BASE=${BASE}"; hr

# (a) dev-login で新規ユーザーの Cookie 取得 (identity未提出/profile未作成の素の状態)
req POST /api/auth/dev-login "${CJ_USER}" \
  -H 'content-type: application/json' \
  -d '{"lineUserId":"Ue2e-user-001"}'

# (b) GET /api/me → canApply:false, canApplyReason:"identity_required"
req GET /api/me "${CJ_USER}"

# 18歳未満の PUT /api/profile → 400 under_age
req PUT /api/profile "${CJ_USER}" \
  -H 'content-type: application/json' \
  -d '{"displayName":"未成年テスト","gender":"male","birthdate":"2015-01-01","areaPref":["ebisu"]}'

# (c) PUT /api/profile (18+) 成功
req PUT /api/profile "${CJ_USER}" \
  -H 'content-type: application/json' \
  -d '{"displayName":"E2E太郎","gender":"male","birthdate":"1994-05-15","areaPref":["ebisu","ginza"],"bio":"よろしく"}'

# (b') me 再取得 → profile はあるが identity 未提出なので canApply:false (identity_required)
req GET /api/me "${CJ_USER}"

# (d) identity/upload → blobRef、続けて identity 申請 → pending
echo ">>> upload identity (multipart)"
BLOBREF="$(curl -sS -X POST "${BASE}/api/identity/upload" -b "${CJ_USER}" -c "${CJ_USER}" \
  -F 'file=@/dev/null;type=image/png;filename=id.png' | sed -E 's/.*"blobRef":"([^"]+)".*/\1/')"
echo "blobRef=${BLOBREF}"; hr
req POST /api/identity "${CJ_USER}" \
  -H 'content-type: application/json' \
  -d "{\"docType\":\"drivers_license\",\"blobRef\":\"${BLOBREF}\"}"

# admin 無認可ガード: 一般ユーザーで admin API → 403
req GET "/api/admin/identity?status=pending" "${CJ_USER}"

# admin ログイン (seed admin を dev-login で。既存adminには昇格しないため seed の lineUserId を使用)
req POST /api/auth/dev-login "${CJ_ADMIN}" \
  -H 'content-type: application/json' \
  -d '{"lineUserId":"Uadmin0000000000000000000000seed"}'

# admin: 審査キュー一覧 (pending に上記申請が出る)
req GET "/api/admin/identity?status=pending" "${CJ_ADMIN}"
IVID="$(cat /tmp/_body.$$ | sed -E 's/.*"id":"([^"]+)".*/\1/')"
echo "identityId=${IVID}"; hr

# (e) admin 承認 → approved
req POST "/api/admin/identity/${IVID}/approve" "${CJ_ADMIN}"

# (f) GET /api/me → canApply:true
req GET /api/me "${CJ_USER}"

# (f') admin: approved 一覧で blobRef が null (画像削除) を確認
req GET "/api/admin/identity?status=approved" "${CJ_ADMIN}"

# IDOR 確認: 別ユーザーでログインしても自分のprofileしか見えない/操作できない
req POST /api/auth/dev-login "${CJ_USER2}" \
  -H 'content-type: application/json' \
  -d '{"lineUserId":"Ue2e-user-002"}'
echo "(user2 の me は user1 と別人・profile:null になるはず)"
req GET /api/me "${CJ_USER2}"

# 未認証ガード: cookie 無しで me → 401
echo ">>> GET /api/me (no cookie)"
curl -sS -o /tmp/_body.$$ -w "HTTP %{http_code}\n" "${BASE}/api/me"
echo "RESP: $(cat /tmp/_body.$$)"; hr

echo "DONE. 後始末: pkill -f \"next dev\""
