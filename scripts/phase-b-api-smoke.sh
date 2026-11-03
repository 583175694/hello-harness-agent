#!/usr/bin/env bash
# Phase B 联调前 API 探活（不替代三端手验）。用法：pnpm dev 后运行 pnpm phase-b:smoke-api
set -euo pipefail

BASE="${HARNESS_API_BASE:-http://127.0.0.1:4318}"
BASE="${BASE%/}"

echo "Phase B API smoke → ${BASE}"

if curl -sf "${BASE}/readyz" >/dev/null 2>&1; then
  echo "OK: GET /readyz"
elif curl -sf "${BASE}/healthz" >/dev/null 2>&1; then
  echo "OK: GET /healthz (readyz unavailable)"
else
  echo "FAIL: API not reachable. Start with: pnpm dev" >&2
  exit 1
fi

PUBLIC=$(curl -sf "${BASE}/api/agent/config/public")
if [[ -z "${PUBLIC}" ]]; then
  echo "FAIL: empty public config" >&2
  exit 1
fi
echo "OK: GET /api/agent/config/public (${#PUBLIC} bytes)"

if [[ -n "${HARNESS_SESSION_COOKIE:-}" ]]; then
  SESSIONS=$(curl -sf -H "Cookie: ${HARNESS_SESSION_COOKIE}" "${BASE}/api/agent/sessions?limit=5")
  echo "OK: GET /api/agent/sessions (authenticated, ${#SESSIONS} bytes)"
  MCP=$(curl -sf -H "Cookie: ${HARNESS_SESSION_COOKIE}" "${BASE}/api/agent/mcp/servers")
  echo "OK: GET /api/agent/mcp/servers (B6 Settings MCP, ${#MCP} bytes)"
  MEM=$(curl -sf -H "Cookie: ${HARNESS_SESSION_COOKIE}" "${BASE}/api/agent/memories")
  echo "OK: GET /api/agent/memories (B6 Memory hub, ${#MEM} bytes)"
else
  echo "SKIP: authenticated routes (export HARNESS_SESSION_COOKIE=harness_session=... after mobile login)"
fi

echo "Phase B API smoke passed (unauthenticated subset)."
