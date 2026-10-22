#!/usr/bin/env bash
# §14 工程侧预检（不替代真机/Maestro E2E 签字）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== mobile gate:engineering =="
pnpm gate:engineering

if command -v maestro >/dev/null 2>&1 || [[ -x "${HOME}/.maestro/bin/maestro" ]]; then
  export PATH="${PATH}:${HOME}/.maestro/bin"
  echo "== maestro check-syntax =="
  pnpm test:maestro:syntax
else
  echo "skip: Maestro CLI not installed (bash scripts/install-maestro.sh)"
fi

echo "== expo-doctor (informational) =="
npx expo-doctor || true

if [[ "${SKIP_API_SMOKE:-}" != "1" ]]; then
  echo "== API smoke (optional; SKIP_API_SMOKE=1 to skip) =="
  bash "$ROOT/scripts/smoke-api.sh" || echo "WARN: API not ready (pnpm dev)"
fi

echo "Done. §14 E2E still requires dev build + runbook sign-off."
