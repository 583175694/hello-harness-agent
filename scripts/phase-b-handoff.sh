#!/usr/bin/env bash
# Phase B 结项前：跑工程门禁并打印仍须人工完成的项（不替代 Gate B 签字）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Phase B 工程验证（CI 同 scope）==="
pnpm phase-b:verify:ci

echo ""
echo "=== 可选：完整仓库验证（含鸿蒙 fixture + smoke-api）==="
echo "  pnpm phase-b:verify:repo"
echo ""
echo "=== macOS iOS Core 编译 ==="
echo "  pnpm phase-b:verify:ios-local"
echo ""
echo "=== 结项仍须执行人完成（不可自动化）==="
echo "  1. 三端 Settings → 同一 API URL → 登录"
echo "  2. export HARNESS_SESSION_COOKIE='harness_session=…' && pnpm phase-b:smoke-api"
echo "  3. 主路径 1–10 + §8 → docs/native-mobile-phase-b-verification-record.md"
echo "  4. pnpm phase-b:parity <sessionId> [runId] 与 Web 对拍"
echo "  5. 原生 ohosArm64（OHOS KMP 工具链到位后）"
echo ""
echo "进度表：docs/native-mobile-phase-b-status.md"
