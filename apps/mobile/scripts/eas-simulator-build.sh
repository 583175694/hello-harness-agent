#!/usr/bin/env bash
# EAS iOS 模拟器开发构建（需 Expo 账号或 EXPO_TOKEN）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${EXPO_TOKEN:-}" ]]; then
  if ! npx eas-cli whoami 2>/dev/null | grep -qv "Not logged in"; then
    echo "FAIL: 未登录 Expo。运行: npx eas-cli login" >&2
    echo "或设置 EXPO_TOKEN: https://docs.expo.dev/accounts/programmatic-access/" >&2
    exit 1
  fi
fi

if ! grep -q '"projectId"' app.json 2>/dev/null; then
  echo "INFO: 首次 EAS 构建需关联项目: npx eas-cli build:configure" >&2
fi

echo "Starting EAS build (profile: simulator, developmentClient)…"
npx eas-cli build --platform ios --profile simulator --non-interactive
echo "Done. 下载 .tar.gz 后: pnpm ios:simulator:install <path>"
