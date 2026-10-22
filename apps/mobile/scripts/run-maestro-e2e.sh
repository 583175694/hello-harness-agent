#!/usr/bin/env bash
# §14 Maestro E2E：预检 + 六条 flow（需 com.harness.agent、API、Metro）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Harness Mobile Maestro E2E =="
echo "前置：pnpm dev（API）+ pnpm dev:mobile（Metro --dev-client）应在其它终端运行"
echo ""

bash scripts/maestro-preflight.sh
pnpm test:maestro:run
echo "Maestro E2E finished."
