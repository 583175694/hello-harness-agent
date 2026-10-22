#!/usr/bin/env bash
# Maestro CLI for §14 E2E. Run from repo: bash apps/mobile/scripts/install-maestro.sh
set -euo pipefail

if command -v maestro >/dev/null 2>&1; then
  maestro --version
  exit 0
fi

if [[ -x "${HOME}/.maestro/bin/maestro" ]]; then
  export PATH="${PATH}:${HOME}/.maestro/bin"
  maestro --version
  exit 0
fi

echo "Installing Maestro to ~/.maestro/bin …"
mkdir -p "${HOME}/.maestro/bin"
if curl -fsSL "https://get.maestro.mobile.dev" | bash; then
  export PATH="${PATH}:${HOME}/.maestro/bin"
  maestro --version
  exit 0
fi

echo "Install failed. Try: brew install mobile-dev-inc/tap/maestro" >&2
echo "Docs: https://maestro.mobile.dev/getting-started/installing-maestro" >&2
exit 1
