#!/usr/bin/env bash
set -euo pipefail
HARMONY_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$HARMONY_ROOT/../.." && pwd)"
CONTRACT="$REPO_ROOT/packages/mobile-contract"
DEST="$HARMONY_ROOT/entry/src/main/resources/rawfile/mobile-contract"
mkdir -p "$DEST/fixtures/preview"
cp "$CONTRACT/design-tokens.json" "$DEST/"
cp "$CONTRACT/fixtures/preview/"*.json "$DEST/fixtures/preview/"
echo "Synced mobile-contract → $DEST"
echo ""
echo "Next: DevEco Studio → Open $HARMONY_ROOT → Run entry module."
echo "      Cold start = Chat (empty-landing). Fixtures: 设置 → 演示场景."
echo "      Signoff: apps/harmony/docs/gate-a-scenario-signoff.md"
