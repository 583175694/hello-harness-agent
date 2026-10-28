#!/usr/bin/env bash
set -euo pipefail
ANDROID_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ANDROID_ROOT/../.." && pwd)"
CONTRACT="$REPO_ROOT/packages/mobile-contract"
DEST="$ANDROID_ROOT/app/src/main/assets/mobile-contract"
mkdir -p "$DEST/fixtures/preview"
cp "$CONTRACT/design-tokens.json" "$DEST/"
cp "$CONTRACT/fixtures/preview/"*.json "$DEST/fixtures/preview/"
echo "Synced mobile-contract → $DEST"
