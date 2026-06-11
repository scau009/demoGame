#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-http://localhost:3000}"

echo "=== 1. Login ==="
TOKEN=$(curl -sS -X POST "$BASE/api/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"test123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "Token: ${TOKEN:0:20}..."

echo "=== 2. Start round ==="
ROUND=$(curl -sS -X POST "$BASE/api/admin/round" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"suit":"heart","rank":7}')
ROUND_ID=$(echo "$ROUND" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "Round ID: $ROUND_ID"

echo "=== 3. Guest submissions ==="
curl -sS -X POST "$BASE/api/round/$ROUND_ID/guess" \
  -H 'Content-Type: application/json' \
  -d '{"nickname":"Alice","clientId":"e2e-1","suit":"heart","rank":5}'

curl -sS -X POST "$BASE/api/round/$ROUND_ID/guess" \
  -H 'Content-Type: application/json' \
  -d '{"nickname":"Bob","clientId":"e2e-2","suit":"spade","rank":13}'

curl -sS -X POST "$BASE/api/round/$ROUND_ID/guess" \
  -H 'Content-Type: application/json' \
  -d '{"nickname":"Charlie","clientId":"e2e-3","suit":"heart","rank":7}'

echo "=== 4. Reveal ==="
RESULT=$(curl -sS -X POST "$BASE/api/admin/round/$ROUND_ID/reveal" \
  -H "Authorization: Bearer $TOKEN")
echo "$RESULT" | python3 -m json.tool 2>/dev/null || echo "$RESULT"

echo "=== 5. Verify ranking ==="
# Charlie (exact match) should be first
FIRST=$(echo "$RESULT" | grep -o '"nickname":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "$FIRST" = "Charlie" ]; then
  echo "PASS: Charlie ranked first (exact match)"
else
  echo "FAIL: Expected Charlie first, got $FIRST"
  exit 1
fi

echo "=== E2E PASS ==="
