#!/usr/bin/env bash
# §14 双端对照：拉取 Run Snapshot 关键字段（与 release-gate-runbook 一致）
set -euo pipefail

BASE="${HARNESS_API_URL:-http://127.0.0.1:4318}"
BASE="${BASE%/}"

usage() {
  echo "Usage: $0 <runId> [sessionId]" >&2
  echo "  HARNESS_API_URL default http://127.0.0.1:4318" >&2
  exit 1
}

[[ $# -ge 1 ]] || usage
RUN_ID="$1"
SESSION_ID="${2:-}"

if ! command -v jq >/dev/null 2>&1; then
  echo "FAIL: jq required" >&2
  exit 1
fi

code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/readyz" || true)"
if [[ "$code" != "200" ]]; then
  echo "FAIL: API not ready ($BASE/readyz → $code). Run: pnpm dev" >&2
  exit 1
fi

echo "== Run $RUN_ID (conversationBlocks + workbench summary) =="
curl -sf "$BASE/api/agent/runs/${RUN_ID}" | jq '{
  runId: .run.id,
  status: .run.status,
  blockCount: (.conversationBlocks | length),
  blockKinds: [.conversationBlocks[]? | .kind],
  workbenchToolCount: (.workbench.toolCalls | length // 0)
}'

if [[ -n "$SESSION_ID" ]]; then
  echo "== Session $SESSION_ID message count =="
  curl -sf "$BASE/api/agent/sessions/${SESSION_ID}" | jq '{
    sessionId: .session.id,
    messageCount: (.session.messages | length)
  }'
fi

echo "Compare blockKinds order + tool states on Mobile vs Web for this run."
