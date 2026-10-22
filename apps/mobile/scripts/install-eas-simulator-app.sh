#!/usr/bin/env bash
# 将 EAS simulator profile 产物装到已启动的 iOS 模拟器
set -euo pipefail

BUNDLE="com.harness.agent"
usage() {
  echo "Usage: $0 <path-to-.tar.gz-or-.app>" >&2
  echo "  EAS 下载示例: eas build:list --platform ios --status finished" >&2
  exit 1
}

[[ $# -eq 1 ]] || usage
INPUT="$1"
[[ -e "$INPUT" ]] || { echo "FAIL: not found: $INPUT" >&2; exit 1; }

if ! xcrun simctl list devices booted 2>/dev/null | grep -q "(Booted)"; then
  echo "FAIL: no booted iOS simulator" >&2
  exit 1
fi

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

APP_PATH=""
case "$INPUT" in
  *.tar.gz | *.tgz)
    tar -xzf "$INPUT" -C "$WORKDIR"
    APP_PATH="$(find "$WORKDIR" -maxdepth 3 -name '*.app' -print -quit || true)"
    ;;
  *.app)
    APP_PATH="$INPUT"
    ;;
  *)
    echo "FAIL: expected .tar.gz or .app" >&2
    exit 1
    ;;
esac

[[ -n "$APP_PATH" && -d "$APP_PATH" ]] || {
  echo "FAIL: could not find .app in archive" >&2
  exit 1
}

echo "Installing: $APP_PATH"
xcrun simctl install booted "$APP_PATH"

if xcrun simctl listapps booted 2>/dev/null | grep -q "$BUNDLE"; then
  echo "OK: $BUNDLE installed. Next: pnpm test:maestro:preflight && pnpm test:maestro:all"
else
  echo "WARN: install finished but $BUNDLE not listed (check bundle id)" >&2
  exit 1
fi
