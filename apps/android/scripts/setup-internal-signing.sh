#!/usr/bin/env bash
# 生成仅用于内测的本地 release keystore（不会提交，密码写入 git-ignored 的 keystore.properties）。
set -euo pipefail

ANDROID_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEYSTORE="$ANDROID_ROOT/internal-release.jks"
PROPERTIES="$ANDROID_ROOT/keystore.properties"
ALIAS="harness-internal"

if [[ -e "$KEYSTORE" || -e "$PROPERTIES" ]]; then
  echo "✗ 已存在 $KEYSTORE 或 $PROPERTIES；为避免破坏覆盖升级能力，本脚本不会覆盖。" >&2
  exit 1
fi

if ! command -v keytool >/dev/null 2>&1; then
  echo "✗ 找不到 keytool，请安装 JDK 17 并确保 keytool 在 PATH 中。" >&2
  exit 1
fi

PASSWORD="${HARNESS_KEYSTORE_PASSWORD:-$(openssl rand -hex 16)}"

umask 077
keytool -genkeypair \
  -keystore "$KEYSTORE" \
  -alias "$ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 3650 \
  -storepass "$PASSWORD" \
  -keypass "$PASSWORD" \
  -dname 'CN=Harness Internal, OU=Mobile, O=Harness, L=Shanghai, ST=Shanghai, C=CN' \
  >/dev/null

cat > "$PROPERTIES" <<EOF
storeFile=$(basename "$KEYSTORE")
storePassword=$PASSWORD
keyAlias=$ALIAS
keyPassword=$PASSWORD
EOF
chmod 600 "$KEYSTORE" "$PROPERTIES"

echo "✓ 已生成内测签名：$KEYSTORE"
echo "✓ 已写入签名配置：$PROPERTIES"
echo "  请备份这两个文件；丢失后无法用同一签名覆盖升级，只能卸载重装。"
