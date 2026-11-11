#!/usr/bin/env bash
# Preview 壳 + release 包（非 debuggable，手感通常优于 previewDebug）
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
bash "$REPO/apps/android/scripts/sync-mobile-contract.sh"

wait_for_android_device() {
  local waited=0
  local max_wait=180
  if "$ADB" get-state >/dev/null 2>&1; then
    return 0
  fi
  echo "→ 等待 Android 设备（请打开模拟器或连接真机，最多 ${max_wait}s）…"
  while ! "$ADB" get-state >/dev/null 2>&1; do
    sleep 2
    waited=$((waited + 2))
    if (( waited >= max_wait )); then
      echo "✗ 超时：adb 无 device。请运行: adb devices" >&2
      exit 1
    fi
  done
}

wait_for_android_device
echo "→ 设备: $("$ADB" devices -l | awk 'NR>1 && $2=="device"{print $1; exit}')"

cd "$REPO/apps/android"
echo "→ 卸载旧包 com.harness.agent（若存在）…"
"$ADB" uninstall com.harness.agent 2>/dev/null || true

echo "→ Gradle 构建并安装 previewRelease（首次可能 1–3 分钟，请稍候）…"
./gradlew :app:installPreviewRelease --no-daemon --console=plain

echo "→ 启动 MainActivity…"
"$ADB" shell am start -n com.harness.agent/com.harness.agent.MainActivity
echo "✓ 已安装并启动 previewRelease"
