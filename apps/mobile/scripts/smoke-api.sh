#!/usr/bin/env bash
# §14 前置：确认 Harness API 可达（默认 4318）
set -euo pipefail

BASE="${HARNESS_API_URL:-http://127.0.0.1:4318}"
BASE="${BASE%/}"

echo "API base: $BASE"

code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/readyz" || true)"
if [[ "$code" != "200" ]]; then
  echo "FAIL: GET /readyz → $code (expected 200). Start API: pnpm dev" >&2
  exit 1
fi
echo "OK: /readyz"

curl -sf "$BASE/healthz" >/dev/null && echo "OK: /healthz" || echo "WARN: /healthz"

if curl -sf "$BASE/api/agent/config/public" | head -c 200 >/dev/null; then
  echo "OK: /api/agent/config/public"
else
  echo "WARN: /api/agent/config/public unreachable" >&2
fi

echo "API smoke passed."
