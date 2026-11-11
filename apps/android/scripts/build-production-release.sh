#!/usr/bin/env bash
# 构建并验签 productionRelease；传 --install 可安装到 ANDROID_SERIAL 指定的设备。
set -euo pipefail

ANDROID_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
APK="$ANDROID_ROOT/app/build/outputs/apk/production/release/app-production-release.apk"

if [[ ! -f "$ANDROID_ROOT/keystore.properties" ]]; then
  echo "✗ 缺少 apps/android/keystore.properties。" >&2
  echo "  先运行: bash apps/android/scripts/setup-internal-signing.sh" >&2
  exit 1
fi

cd "$ANDROID_ROOT"
./gradlew :app:assembleProductionRelease --no-daemon

if [[ ! -f "$APK" ]]; then
  echo "✗ 未找到已签名 APK: $APK" >&2
  echo "  Gradle 仍产出 unsigned 包时，请检查 keystore.properties 的 storeFile 路径。" >&2
  exit 1
fi

APKSIGNER="$(find "$SDK/build-tools" -name apksigner -type f 2>/dev/null | sort -V | tail -1)"
if [[ -z "$APKSIGNER" ]]; then
  echo "✗ 找不到 apksigner；请安装 Android SDK Build-Tools。" >&2
  exit 1
fi
"$APKSIGNER" verify --print-certs "$APK" >/dev/null
echo "✓ 签名验证通过: $APK"

if [[ "${1:-}" == "--install" ]]; then
  ADB="$SDK/platform-tools/adb"
  if ! "$ADB" install -r "$APK"; then
    echo "" >&2
    echo "✗ 安装失败。若是 INSTALL_FAILED_UPDATE_INCOMPATIBLE，说明设备上已有不同签名的包。" >&2
    echo "  如需保留旧数据，请换用同一份 keystore；否则先执行 adb uninstall com.harness.agent（会清数据）。" >&2
    exit 1
  fi
  "$ADB" shell am start -n com.harness.agent/com.harness.agent.MainActivity
  echo "✓ 已安装并启动 productionRelease"
fi
