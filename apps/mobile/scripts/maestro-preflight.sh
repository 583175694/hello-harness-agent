#!/usr/bin/env bash
# Maestro E2E 前置：CLI、API、模拟器 dev build（不跑 flow）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="com.harness.agent"
export PATH="${PATH}:${HOME}/.maestro/bin"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

hint_dev_build() {
  echo "" >&2
  echo "Dev build 未安装。任选其一：" >&2
  echo "  1) Xcode ≥26.4：cd apps/mobile && pnpm ios:dev-build" >&2
  echo "  2) EAS：eas login && pnpm ios:simulator:eas（仓库根目录亦可）&& pnpm ios:simulator:install <.tar.gz>" >&2
  echo "  见 docs/ios-dev-build.md" >&2
}

if ! command -v maestro >/dev/null 2>&1; then
  fail "Maestro CLI 未安装（bash scripts/install-maestro.sh）"
fi
echo "OK: maestro $(maestro --version 2>/dev/null | head -1 || true)"

if ! xcrun simctl list devices booted 2>/dev/null | grep -q "(Booted)"; then
  fail "无已启动的 iOS 模拟器（pnpm ios:open 或 Xcode 启动 Simulator）"
fi
echo "OK: booted iOS simulator"

if ! xcrun simctl listapps booted 2>/dev/null | grep -q "$BUNDLE"; then
  xcode_line="$(xcodebuild -version 2>/dev/null | sed -n '1p' || true)"
  [[ -n "$xcode_line" ]] || xcode_line="Xcode unknown"
  echo "WARN: ${xcode_line}; Expo SDK 57 需 Xcode 26.4+ 才能本地 expo run:ios" >&2
  if npx eas-cli whoami 2>/dev/null | grep -qv "Not logged in"; then
    echo "INFO: EAS 已登录，可用 pnpm ios:simulator:eas" >&2
  else
    echo "INFO: EAS 未登录（eas login 或设置 EXPO_TOKEN）" >&2
  fi
  hint_dev_build
  fail "模拟器未安装 $BUNDLE"
fi
echo "OK: $BUNDLE installed on booted simulator"

bash "$ROOT/scripts/smoke-api.sh"

metro_code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8081/status 2>/dev/null || echo 000)"
if [[ "$metro_code" == "200" ]]; then
  echo "OK: Metro (8081)"
else
  echo "WARN: Metro 未就绪（开发构建需 bundler）。另开终端：pnpm dev + pnpm dev:mobile" >&2
fi

echo "Maestro preflight passed. Run: pnpm test:maestro or pnpm test:maestro:all"
