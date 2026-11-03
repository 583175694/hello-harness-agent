#!/usr/bin/env bash
# 皮皮虾 BrandIcon（与 apps/ios/Harness/Resources/brand-icon-app.png 同源）
set -euo pipefail
ANDROID_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ANDROID_ROOT/../.." && pwd)"
SRC="$REPO_ROOT/apps/ios/Harness/Resources/brand-icon-app.png"
DEST="$ANDROID_ROOT/app/src/main/res/drawable/brand_icon_app.png"
mkdir -p "$(dirname "$DEST")"
cp "$SRC" "$DEST"
echo "Synced brand icon → $DEST"
