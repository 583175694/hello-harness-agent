# Harness HarmonyOS（Native Mobile Phase A）

ArkTS + ArkUI 原生壳；Phase A 经 **`port/AgentSessionPort`** + **`preview/PreviewAgentSessionPort`** 加载 fixture（内部 `PreviewFixtureLoader`），页面 **不直接读** rawfile JSON；UI 用 **`coreui/HarnessColors`** 对齐 `design-tokens.json`。

## 打开 Preview / Dev Menu

1. 安装 [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/)（HarmonyOS NEXT API 17+）。
2. **同步 fixture**（与 Android assets 同步等价）：

```bash
cd apps/harmony
./scripts/sync-mobile-contract.sh
```

3. DevEco：**Open** → 选择 **`apps/harmony`** 根目录 → Run **entry**。
4. 首屏 **Preview / Dev Menu**，点十场景之一进入 Chat 预览壳。

RN 对照：`apps/mobile/app/preview/index.tsx`。

Gate A 验收：[`docs/gate-a-runbook.md`](docs/gate-a-runbook.md)、[`docs/gate-a-manual-checklist.md`](docs/gate-a-manual-checklist.md)、[`docs/gate-a-scenario-signoff.md`](docs/gate-a-scenario-signoff.md)；仓库级 [`docs/native-mobile-gate-a-ui-regression.md`](../../docs/native-mobile-gate-a-ui-regression.md)。

```bash
# 仓库根目录
pnpm gate-a:verify:harmony
pnpm gate-a:verify:all    # macOS：含 Android + iOS Snapshot
```

## 目录

```text
AppScope/          # 应用级配置
entry/             # EntryAbility + Preview 页面
entry/.../coreui/  # Gate A tokens + §16.2 primitives（AppScaffold、AppSheet、ListRow…）
entry/.../port/    # AgentSessionPort（Phase B 预留）
entry/.../preview/ # PreviewAgentSessionPort、FixtureLoader、Patterns、Workbench
scripts/           # contract → rawfile 同步
```
