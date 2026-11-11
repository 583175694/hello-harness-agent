#!/usr/bin/env bash
# 生成可分发到内测用户的 productionRelease APK（必须是已签名包）。
set -euo pipefail

ANDROID_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
OUT_DIR="$ANDROID_ROOT/../../artifacts/android-internal"
SOURCE_APK="$ANDROID_ROOT/app/build/outputs/apk/production/release/app-production-release.apk"

VERSION_CODE="${HARNESS_VERSION_CODE:-}"
VERSION_NAME="${HARNESS_VERSION_NAME:-}"

if [[ ! -f "$ANDROID_ROOT/keystore.properties" && -z "${ANDROID_KEYSTORE_PATH:-}" ]]; then
  echo "✗ 缺少签名配置：keystore.properties 或 ANDROID_KEYSTORE_PATH。" >&2
  echo "  本地先运行: bash apps/android/scripts/setup-internal-signing.sh" >&2
  exit 1
fi

if [[ -z "$VERSION_CODE" || -z "$VERSION_NAME" ]]; then
  echo "✗ 发布包必须显式指定版本：HARNESS_VERSION_CODE 与 HARNESS_VERSION_NAME。" >&2
  echo "  示例: HARNESS_VERSION_CODE=2 HARNESS_VERSION_NAME=0.1.1 bash apps/android/scripts/release-internal.sh" >&2
  exit 1
fi

if ! [[ "$VERSION_CODE" =~ ^[1-9][0-9]*$ ]]; then
  echo "✗ HARNESS_VERSION_CODE 必须是正整数。" >&2
  exit 1
fi

cd "$ANDROID_ROOT"
./gradlew :app:assembleProductionRelease \
  -PharnessVersionCode="$VERSION_CODE" \
  -PharnessVersionName="$VERSION_NAME" \
  --no-daemon

if [[ ! -f "$SOURCE_APK" ]]; then
  echo "✗ 未找到已签名 APK: $SOURCE_APK" >&2
  echo "  unsigned 产物不能用于内测，请检查 keystore.properties。" >&2
  exit 1
fi

APKSIGNER="$(find "$SDK/build-tools" -name apksigner -type f 2>/dev/null | sort -V | tail -1)"
if [[ -z "$APKSIGNER" ]]; then
  echo "✗ 找不到 apksigner；请安装 Android SDK Build-Tools。" >&2
  exit 1
fi
"$APKSIGNER" verify "$SOURCE_APK" >/dev/null

mkdir -p "$OUT_DIR"
OUT_APK="$OUT_DIR/pipishrimp-${VERSION_NAME}-${VERSION_CODE}.apk"
cp "$SOURCE_APK" "$OUT_APK"
sha256sum "$OUT_APK" > "$OUT_APK.sha256" 2>/dev/null || shasum -a 256 "$OUT_APK" > "$OUT_APK.sha256"

echo "✓ 内测包：$OUT_APK"
echo "✓ 校验和：$OUT_APK.sha256"
echo "  版本：$VERSION_NAME ($VERSION_CODE)"
