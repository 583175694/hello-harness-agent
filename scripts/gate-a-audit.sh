#!/usr/bin/env bash
# Gate A 本地审计：validate + 快照清单 + 阻塞项摘要（不 commit）。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== validate:gate-a =="
pnpm validate:gate-a

echo ""
echo "== snapshot baselines =="
node packages/mobile-contract/scripts/list-gate-a-snapshot-baselines.mjs

echo ""
node packages/mobile-contract/scripts/verify-gate-a-human-evidence.mjs

echo ""
echo "== blockers (docs/native-mobile-gate-a-blockers.md) =="
sed -n '1,14p' docs/native-mobile-gate-a-blockers.md

echo ""
echo "关 Goal（人工）：docs/native-mobile-gate-a-signoff-checklist.md"
echo "全量三端（macOS）：pnpm gate-a:verify:all"
echo "合并前：pnpm gate-a:prep-commit"
