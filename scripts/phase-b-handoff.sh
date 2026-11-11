#!/usr/bin/env bash
# Phase B 结项前：跑工程门禁并打印仍须人工完成的项（不替代 Gate B 签字）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Phase B 工程验证（CI job native-mobile-phase-b-engine 同 scope）==="
cd packages/mobile-core
./gradlew :core-test:jvmTest :core-data:jvmTest --no-daemon
bash scripts/verify-ohos-toolchain.sh
cd "$ROOT"
pnpm --filter @harness/mobile-contract validate:gate-a
cd apps/android && ./gradlew :app:compileProductionDebugKotlin --no-daemon
cd "$ROOT"

echo ""
echo "=== 可选：smoke-api / 鸿蒙 assert ==="
echo "  bash scripts/phase-b-api-smoke.sh"
echo "  bash apps/harmony/scripts/sync-mobile-contract.sh && node apps/harmony/scripts/assert-preview-fixtures.mjs"
echo ""
echo "=== macOS iOS Core 编译（CI job native-mobile-phase-b-ios）==="
echo "  cd packages/mobile-core && ./gradlew :core-engine:assembleXCFramework --no-daemon"
echo "  cd apps/ios && xcodegen generate && xcodebuild -scheme Harness -configuration Release -destination 'platform=iOS Simulator,name=iPhone 17' build CODE_SIGNING_ALLOWED=NO"
echo ""
echo "=== 结项仍须执行人完成（不可自动化）==="
echo "  1. 三端 Settings → 同一 API URL → 登录"
echo "  2. export HARNESS_SESSION_COOKIE='harness_session=…' && bash scripts/phase-b-api-smoke.sh"
echo "  3. 主路径 1–10 + §8 → docs/native-mobile-phase-b-verification-record.md"
echo "  4. HARNESS_SESSION_COOKIE=… node scripts/phase-b-parity.mjs <sessionId> [runId] 与 Web 对拍"
echo "  5. 原生 ohosArm64（OHOS KMP 工具链到位后）"
echo ""
echo "进度表：docs/native-mobile-phase-b-status.md"
