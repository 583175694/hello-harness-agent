#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ "${enableOhosArm64:-false}" == "true" ]] || [[ "${1:-}" == "--require" ]]; then
  if ! command -v ohos-clang >/dev/null 2>&1 && ! command -v hvigorw >/dev/null 2>&1; then
    echo "ohosArm64: OHOS KMP toolchain not on PATH (set up CPF-KMP / DevEco SDK)."
    echo "JVM golden remains authoritative until ohosArm64() is wired in core-api/build.gradle.kts."
    exit 1
  fi
fi
./gradlew :core-test:jvmTest :core-data:jvmTest -PenableOhosArm64=true --no-daemon
echo "ohosArm64 verify: JVM domain golden green (native ohosArm64 target pending toolchain)."
