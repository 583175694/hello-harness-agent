#!/usr/bin/env bash
# Gate A 合并前：跑 validate + 快照清单，并打印建议 git add 范围（不自动 commit）。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== validate:gate-a =="
pnpm validate:gate-a

echo ""
echo "== snapshot baselines =="
node packages/mobile-contract/scripts/list-gate-a-snapshot-baselines.mjs

echo ""
echo "== 工作树（Gate A 相关路径）=="
git status --short -- \
  apps/android \
  apps/ios \
  apps/harmony \
  packages/mobile-contract \
  docs/native-mobile-gate-a-completion-audit.md \
  docs/native-mobile-gate-a-evidence.md \
  docs/native-mobile-gate-a-milestone-audit.md \
  docs/native-mobile-gate-a-open-items.md \
  docs/native-mobile-gate-a-blockers.md \
  docs/native-mobile-gate-a-scenario-matrix.md \
  docs/native-mobile-gate-a-ui-regression-signoff.md \
  docs/native-mobile-gate-a-signoff-checklist.md \
  docs/native-mobile-gate-a-ui-regression.md \
  docs/44-native-mobile-phase-a-static-ui.md \
  docs/43-native-mobile-clients-architecture.md \
  docs/18-project-structure.md \
  README.md \
  .github/workflows/ci.yml \
  package.json \
  pnpm-lock.yaml \
  scripts/gate-a-prep-commit.sh \
  scripts/gate-a-audit.sh

cat <<'EOF'

建议提交范围（按需调整）：
  git add apps/android apps/ios apps/harmony packages/mobile-contract
  git add docs/native-mobile-gate-a-* docs/44-native-mobile-phase-a-static-ui.md docs/43-native-mobile-clients-architecture.md docs/18-project-structure.md
  git add packages/mobile-core   # Phase A 占位 README，无运行时
  git add .github/workflows/ci.yml README.md package.json pnpm-lock.yaml scripts/gate-a-prep-commit.sh scripts/gate-a-audit.sh
  git add packages/mobile-contract/scripts/verify-gate-a-human-evidence.mjs packages/mobile-contract/package.json
  git add apps/android/docs apps/ios/docs apps/harmony/docs
  git add apps/android/scripts/run-gate-a-long-thread-benchmark.sh apps/android/scripts/print-gate-a-benchmark-summary.mjs apps/android/scripts/launch-preview.sh
  git add apps/ios/scripts/run-gate-a-long-thread-scroll.sh apps/ios/scripts/print-gate-a-ios-scroll-summary.mjs apps/ios/scripts/launch-preview.sh
  git add packages/mobile-contract/scripts/report-gate-a-completion.mjs

手验仍未替代：鸿蒙 scenario signoff、UI 回归 57 格（§8.2 runbook 已填见 open-items）。

注意：Android assets/ 与鸿蒙 rawfile/mobile-contract/ 在 .gitignore 中（仅 contract 包入库）；CI 与本地 gate-a:verify 会先 sync。
EOF

if git status --porcelain -- apps/android packages/mobile-contract 2>/dev/null | head -1 | grep -q '^??'; then
  echo ""
  echo "WARNING: Gate A 路径仍为未跟踪 (??) — 远程/CI 无法复现，需 git add + commit。"
fi
