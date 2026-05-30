#!/usr/bin/env bash
# Lv2 curl battery (PORT=3300). Seed IDs: seed-slot-normal / -twenties / -badge.
# Prints HTTP status + JSON body per step and a PASS/FAIL tally.
BASE="http://localhost:3300"
USER_JAR=$(mktemp); ADMIN_JAR=$(mktemp); ANON_JAR=$(mktemp); MALE_JAR=$(mktemp)
PASS=0; FAIL=0
hr(){ echo "------------------------------------------------------------"; }
req(){ # METHOD PATH JAR [json]
  local m="$1" p="$2" jar="$3" data="$4"
  if [ -n "$data" ]; then
    curl -sS -m 30 -o /tmp/body.$$ -w "%{http_code}" -b "$jar" -c "$jar" -X "$m" "$BASE$p" -H 'content-type: application/json' -d "$data"
  else
    curl -sS -m 30 -o /tmp/body.$$ -w "%{http_code}" -b "$jar" -c "$jar" -X "$m" "$BASE$p"
  fi
}
show(){ echo "[$1] HTTP=$2"; echo "  body: $(cat /tmp/body.$$)"; }
assert(){ # label got want substr
  local label="$1" got="$2" want="$3" sub="$4" body; body="$(cat /tmp/body.$$)"; local ok=1
  [ "$got" = "$want" ] || ok=0
  if [ -n "$sub" ]; then echo "$body" | grep -q "$sub" || ok=0; fi
  if [ "$ok" = 1 ]; then echo "  => PASS ($label)"; PASS=$((PASS+1)); else echo "  => FAIL ($label) want=$want sub=[$sub] got=$got"; FAIL=$((FAIL+1)); fi
}

echo "##### T1 anon GET /api/me -> 401 unauthorized #####"
C=$(req GET /api/me "$ANON_JAR"); show "anon /me" "$C"; assert "T1 anon 401" "$C" 401 unauthorized; hr

echo "##### T2 user dev-login -> 200 #####"
C=$(req POST /api/auth/dev-login "$USER_JAR" '{"lineUserId":"qa-user-1","role":"user"}'); show "user login" "$C"; assert "T2 login 200" "$C" 200 '"role":"user"'; hr

echo "##### T3 GET /api/me pre -> canApply:false identity_required #####"
C=$(req GET /api/me "$USER_JAR"); show "me pre" "$C"; assert "T3 me canApplyReason identity_required" "$C" 200 '"canApplyReason":"identity_required"'; hr

echo "##### T4 PUT /api/profile 17yo -> 400 under_age #####"
C=$(req PUT /api/profile "$USER_JAR" '{"displayName":"QA Teen","gender":"male","birthdate":"2009-06-01","areaPref":["ebisu"],"bio":"x"}'); show "profile 17" "$C"; assert "T4 under_age 400" "$C" 400 under_age; hr

echo "##### T5 PUT /api/profile 18+ male -> 200 #####"
C=$(req PUT /api/profile "$USER_JAR" '{"displayName":"QA User","gender":"male","birthdate":"1995-06-01","areaPref":["ebisu"],"bio":"hi"}'); show "profile ok" "$C"; assert "T5 profile 200" "$C" 200 '"age":'; hr

echo "##### T6 GET /api/slots -> seed-slot-normal present #####"
C=$(req GET /api/slots "$USER_JAR"); show "slots" "$C"; assert "T6 slots has seed-slot-normal" "$C" 200 seed-slot-normal; hr

echo "##### T7 apply normal slot BEFORE identity -> 409 identity_required #####"
C=$(req POST /api/slots/seed-slot-normal/apply "$USER_JAR" ""); show "apply pre-id" "$C"; assert "T7 apply 409 identity_required" "$C" 409 identity_required; hr

echo "##### T8 identity upload (PNG) -> 200 blobRef #####"
printf '\x89PNG\r\n\x1a\n' > /tmp/idimg.png; head -c 64 /dev/zero >> /tmp/idimg.png
C=$(curl -sS -m 30 -o /tmp/body.$$ -w "%{http_code}" -b "$USER_JAR" -c "$USER_JAR" -X POST "$BASE/api/identity/upload" -F "file=@/tmp/idimg.png;type=image/png"); show "id upload" "$C"; assert "T8 upload 200 blobRef" "$C" 200 blobRef
BLOBREF=$(cat /tmp/body.$$ | sed -E 's/.*"blobRef":"([^"]+)".*/\1/'); echo "  BLOBREF=$BLOBREF"; hr

echo "##### T9 POST /api/identity -> 200 pending #####"
C=$(req POST /api/identity "$USER_JAR" "{\"docType\":\"passport\",\"blobRef\":\"$BLOBREF\"}"); show "id apply" "$C"; assert "T9 identity pending" "$C" 200 pending; hr

echo "##### T10 non-admin hits admin API -> 403 forbidden #####"
C=$(req GET /api/admin/identity "$USER_JAR" ""); show "user->admin" "$C"; assert "T10 admin 403" "$C" 403 forbidden; hr

echo "##### T11 admin dev-login (seed admin) -> 200 role admin #####"
C=$(req POST /api/auth/dev-login "$ADMIN_JAR" '{"lineUserId":"Uadmin0000000000000000000000seed"}'); show "admin login" "$C"; assert "T11 admin login" "$C" 200 '"role":"admin"'; hr

echo "##### T12 admin pending queue -> our passport item present #####"
C=$(req GET '/api/admin/identity?status=pending' "$ADMIN_JAR" ""); show "queue" "$C"; assert "T12 queue has passport" "$C" 200 '"docType":"passport"'
IDID=$(cat /tmp/body.$$ | sed -E 's/.*\[\{"id":"([^"]+)".*/\1/'); echo "  IDENTITY_ID=$IDID"; hr

echo "##### T13 admin approve identity -> 200 approved #####"
C=$(req POST "/api/admin/identity/$IDID/approve" "$ADMIN_JAR" ""); show "approve" "$C"; assert "T13 approve 200" "$C" 200 approved; hr

echo "##### T14 admin approved queue -> our id has blobRef:null (PII deleted) #####"
C=$(req GET '/api/admin/identity?status=approved' "$ADMIN_JAR" ""); show "queue approved" "$C"
B="$(cat /tmp/body.$$)"; if echo "$B" | grep -q "\"id\":\"$IDID\"" && echo "$B" | grep -q '"blobRef":null'; then echo "  => PASS (T14 approved blobRef null)"; PASS=$((PASS+1)); else echo "  => FAIL (T14 approved blobRef not null for our id)"; FAIL=$((FAIL+1)); fi; hr

echo "##### T15 GET /api/me after approve -> canApply:true #####"
C=$(req GET /api/me "$USER_JAR" ""); show "me post" "$C"; assert "T15 canApply true" "$C" 200 '"canApply":true'; hr

echo "##### T16 apply normal slot now -> 200 applied #####"
C=$(req POST /api/slots/seed-slot-normal/apply "$USER_JAR" ""); show "apply ok" "$C"; assert "T16 apply 200 applied" "$C" 200 '"status":"applied"'; hr

echo "##### T17 double apply same slot -> 409 already_applied #####"
C=$(req POST /api/slots/seed-slot-normal/apply "$USER_JAR" ""); show "apply dup" "$C"; assert "T17 dup 409 already_applied" "$C" 409 already_applied; hr

echo "##### T18 apply 20s-only slot as 30yo -> 409 age_out_of_range #####"
C=$(req POST /api/slots/seed-slot-twenties/apply "$USER_JAR" ""); show "apply 20s" "$C"; assert "T18 age 409 age_out_of_range" "$C" 409 age_out_of_range; hr

echo "##### T19 apply badge-only slot (no premium) -> 409 badge_required #####"
C=$(req POST /api/slots/seed-slot-badge/apply "$USER_JAR" ""); show "apply badge" "$C"; assert "T19 badge 409 badge_required" "$C" 409 badge_required; hr

echo "##### T20 GET /api/applications -> shows applied normal slot #####"
C=$(req GET /api/applications "$USER_JAR" ""); show "my apps" "$C"; assert "T20 apps has seed-slot-normal" "$C" 200 seed-slot-normal; hr

echo "##### T21 admin create slot -> 200 id #####"
DT=$(date -u -d '+10 days' +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%S.000Z)
C=$(req POST /api/admin/slots "$ADMIN_JAR" "{\"datetimeStart\":\"$DT\",\"area\":\"ginza\"}"); show "admin create" "$C"; assert "T21 create 200" "$C" 200 '"slot":{"id"'; hr

echo "##### T22 GET /api/slots/[id] -> detail eligibility (twenties=age_out_of_range) #####"
C=$(req GET /api/slots/seed-slot-twenties "$USER_JAR" ""); show "slot detail" "$C"; assert "T22 detail age_out_of_range" "$C" 200 age_out_of_range; hr

echo "##### T23 badge slot detail as premium seed-male -> canApply:true (badge path affirmative) #####"
C=$(req POST /api/auth/dev-login "$MALE_JAR" '{"lineUserId":"Umale00000000000000000000000seed"}'); show "male login" "$C"
C=$(req GET /api/slots/seed-slot-badge "$MALE_JAR" ""); show "badge detail (male)" "$C"; assert "T23 badge canApply true for premium male" "$C" 200 '"canApply":true'; hr

echo "##### T24 admin GET /api/admin/slots -> seed-slot-twenties present #####"
C=$(req GET /api/admin/slots "$ADMIN_JAR" ""); show "admin slots" "$C"; assert "T24 admin slots list" "$C" 200 seed-slot-twenties; hr

echo "============================================================"
echo "CURL SUMMARY: PASS=$PASS FAIL=$FAIL"
rm -f /tmp/body.$$
