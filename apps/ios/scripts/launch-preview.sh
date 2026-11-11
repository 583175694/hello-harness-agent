#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIM="${GATE_A_IOS_SIM:-iPhone 17}"
cd "$ROOT"
xcodegen generate -q
xcodebuild build -scheme Harness -destination "platform=iOS Simulator,name=${SIM}" -quiet CODE_SIGNING_ALLOWED=NO
APP="$(find ~/Library/Developer/Xcode/DerivedData -path "*/Build/Products/Debug-iphonesimulator/Harness.app" -type d -mmin -120 | head -1)"
if [ ! -d "$APP" ]; then
  echo "Harness.app not found; open Xcode and Run scheme Harness." >&2
  exit 1
fi
xcrun simctl boot "$SIM" 2>/dev/null || true
xcrun simctl bootstatus "$SIM" -b
xcrun simctl install "$SIM" "$APP"
xcrun simctl launch "$SIM" com.harness.agent
