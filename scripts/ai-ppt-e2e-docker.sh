#!/usr/bin/env bash
# Run the AI PPT E2E inside the sandbox browser image (CJK fonts + Chromium).
#
# The repo is bind-mounted read-only for source; dependencies are installed in
# a throwaway container layer so the host's macOS node_modules are never
# rewritten with Linux binaries, and the image's Chromium is reused instead of
# downloading a second browser.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${HARNESS_SANDBOX_BROWSER_IMAGE:-harness-sandbox-browser:local}"
OUT_DIR="${AI_PPT_E2E_OUT:-$ROOT/qa/ai-ppt-e2e-run}"

mkdir -p "$OUT_DIR"

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Image $IMAGE not found; building it now."
  docker build -f "$ROOT/dev/opensandbox-local/Dockerfile.harness-sandbox-browser" -t "$IMAGE" "$ROOT/dev/opensandbox-local"
fi

# Always run the build-time probe inside the real image first: it is the gate
# that prevents the "everything looks green, Chinese renders as tofu" failure.
docker run --rm "$IMAGE" /usr/local/bin/font-probe-f0.sh

docker run --rm \
  --network host \
  -v "$ROOT:/src:ro" \
  -v "$OUT_DIR:/out" \
  -e CHROME_PATH=/usr/bin/chromium \
  -e CI=1 \
  -w /work \
  "$IMAGE" \
  bash -lc '
    set -euo pipefail
    cp -R /src/packages /src/scripts /src/package.json /src/pnpm-workspace.yaml /src/pnpm-lock.yaml /src/tsconfig.base.json ./
    mkdir -p apps
    cp -R /src/apps/api ./apps/api
    corepack enable >/dev/null 2>&1
    pnpm install --filter @harness/ai-ppt... --filter @harness/api... --frozen-lockfile >/dev/null
    pnpm --filter @harness/ai-ppt build >/dev/null
    cd apps/api
    pnpm exec tsx ../../scripts/ai-ppt-e2e.mts --out /out
  '
