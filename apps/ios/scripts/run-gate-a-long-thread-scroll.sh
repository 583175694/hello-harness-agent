#!/usr/bin/env bash
# Gate A §8.2 iOS：Simulator 自动滚动 long-thread 并拉取 gate-a-scroll-perf.json
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SIM="${GATE_A_IOS_SIM:-iPhone 17}"
BUNDLE=com.harness.agent

echo "== xcodegen + build =="
xcodegen generate
xcodebuild build -scheme Harness -destination "platform=iOS Simulator,name=${SIM}" -quiet CODE_SIGNING_ALLOWED=NO

APP="$(find ~/Library/Developer/Xcode/DerivedData -path "*/Build/Products/Debug-iphonesimulator/Harness.app" -type d 2>/dev/null | head -1)"
if [ -z "$APP" ]; then
  APP="$(find ~/Library/Developer/Xcode/DerivedData -path "*/Build/Products/Debug-iphonesimulator/Harness.app" -type d -mmin -30 | head -1)"
fi
if [ ! -d "$APP" ]; then
  echo "ERROR: Harness.app not found in DerivedData" >&2
  exit 1
fi

echo "== boot simulator: ${SIM} =="
xcrun simctl boot "$SIM" 2>/dev/null || true
xcrun simctl bootstatus "$SIM" -b

echo "== install + launch -GateAScrollPerf =="
xcrun simctl uninstall "$SIM" "$BUNDLE" 2>/dev/null || true
xcrun simctl install "$SIM" "$APP"
xcrun simctl terminate "$SIM" "$BUNDLE" 2>/dev/null || true
xcrun simctl launch "$SIM" "$BUNDLE" -GateAScrollPerf

echo "== wait for metrics (CADisplayLink ~15s) =="
sleep 22

DATA="$(xcrun simctl get_app_container "$SIM" "$BUNDLE" data)"
JSON="$DATA/Documents/gate-a-scroll-perf.json"
if [ ! -f "$JSON" ]; then
  echo "ERROR: missing $JSON" >&2
  exit 1
fi
mkdir -p "$ROOT/build"
cp "$JSON" "$ROOT/build/gate-a-scroll-perf.json"
cat "$JSON"
echo ""
node "$(dirname "$0")/print-gate-a-ios-scroll-summary.mjs" "$ROOT/build/gate-a-scroll-perf.json"
