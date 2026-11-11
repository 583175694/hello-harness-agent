#!/usr/bin/env bash
# Gate A §8.2：长列表 Macrobenchmark（需 adb device）。可选启动 AVD。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

AVD="${GATE_A_ANDROID_AVD:-Medium_Phone_API_36.0}"
EMULATOR="${ANDROID_HOME:-$HOME/Library/Android/sdk}/emulator/emulator"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"

wait_for_boot() {
  echo "== 等待 adb device 就绪 =="
  "$ADB" wait-for-device
  for _ in $(seq 1 90); do
    boot=$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
    if [ "$boot" = "1" ]; then
      echo "boot_completed=1"
      "$ADB" devices -l
      return 0
    fi
    sleep 2
  done
  echo "ERROR: 模拟器/设备 boot 超时" >&2
  return 1
}

ensure_device() {
  if "$ADB" devices | awk 'NR>1 && $2=="device"{found=1} END{exit !found}'; then
    echo "已有 adb device"
    return 0
  fi
  if [ ! -x "$EMULATOR" ]; then
    echo "ERROR: 无 device 且找不到 emulator: $EMULATOR" >&2
    exit 1
  fi
  echo "== 启动 AVD: $AVD =="
  nohup "$EMULATOR" -avd "$AVD" -no-audio -no-boot-anim > /tmp/gate-a-emulator.log 2>&1 &
  echo "emulator log: /tmp/gate-a-emulator.log"
  wait_for_boot
}

ensure_device

echo "== 清理旧签名冲突的安装 =="
"$ADB" uninstall com.harness.agent 2>/dev/null || true
"$ADB" uninstall com.harness.agent.macrobenchmark 2>/dev/null || true

echo "== assemble Preview debug =="
./gradlew :app:assemblePreviewDebug --no-daemon -q

echo "== Macrobenchmark LongThreadScrollBenchmark =="
./gradlew :macrobenchmark:connectedPreviewBenchmarkAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=com.harness.agent.macrobenchmark.LongThreadScrollBenchmark \
  --no-daemon

LOGCAT_OUT="$ROOT/macrobenchmark/build/gate-a-benchmark-logcat.txt"
mkdir -p "$(dirname "$LOGCAT_OUT")"
"$ADB" logcat -d 2>/dev/null | rg -i 'Benchmark|FrameTiming|scrollConversation|frameDuration|Macrobenchmark' | tail -100 > "$LOGCAT_OUT" || true

echo ""
echo "== logcat summary: ${LOGCAT_OUT} =="
tail -20 "${LOGCAT_OUT}" 2>/dev/null || true
echo ""
node "$(dirname "$0")/print-gate-a-benchmark-summary.mjs" || true
echo "指标也可在 Android Studio Benchmark 面板或 macrobenchmark/build/outputs/connected_android_test_additional_output/"
echo "填表：apps/android/docs/gate-a-runbook.md"
