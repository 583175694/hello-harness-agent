#!/usr/bin/env bash
# Run full AI PPT E2E inside the sandbox browser image (CJK fonts + Chromium).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${HARNESS_SANDBOX_BROWSER_IMAGE:-harness-sandbox-browser:local}"

docker build -f "$ROOT/dev/opensandbox-local/Dockerfile.harness-sandbox-browser" -t "$IMAGE" "$ROOT/dev/opensandbox-local"

docker run --rm \
  -v "$ROOT:/workspace" \
  -w /workspace \
  -e CI=1 \
  "$IMAGE" \
  bash -lc '
    set -euo pipefail
    apt-get update -qq && apt-get install -y -qq python3 fontconfig >/dev/null
    corepack enable
    pnpm install --filter @harness/ai-ppt... --filter @harness/api... 2>/dev/null || pnpm install
    cd packages/ai-ppt && pnpm exec playwright install chromium
    cd /workspace/apps/api && pnpm exec tsx ../../scripts/ai-ppt-e2e.mts --out ../../qa/ai-ppt-e2e-run
  '
