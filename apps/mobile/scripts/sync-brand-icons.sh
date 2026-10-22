#!/usr/bin/env bash
# 从 Web 品牌资源同步 Expo 图标（需 ImageMagick `magick`）。
set -euo pipefail
MOBILE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$MOBILE_ROOT/../.." && pwd)"
BRAND="$REPO_ROOT/apps/web/public/brand"
MOBILE="$MOBILE_ROOT/assets"

magick "$BRAND/favicon-source.png" -background black -alpha remove -alpha off "$MOBILE/icon.png"
magick -size 1024x1024 xc:'#f7f7f6' "$MOBILE/android-icon-background.png"
magick "$BRAND/favicon-source.png" -resize 682x682 -gravity center -background none -extent 1024x1024 \
  "$MOBILE/android-icon-foreground.png"
magick "$BRAND/mark-black.png" -resize 640x640 -gravity center -background none -extent 1024x1024 \
  "$MOBILE/android-icon-monochrome.png"
magick "$BRAND/favicon-source.png" -resize 320x320 -gravity center -background none -extent 512x512 \
  "$MOBILE/splash-icon.png"
magick "$BRAND/apple-touch-icon.png" -resize 48x48 "$MOBILE/favicon.png"
cp "$BRAND/apple-touch-icon.png" "$MOBILE/brand-icon-app.png"
echo "Synced brand icons into $MOBILE"
