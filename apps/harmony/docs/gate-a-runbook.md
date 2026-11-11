# HarmonyOS Gate A Runbook

与 [44 §8.3](../../../docs/44-native-mobile-phase-a-static-ui.md) 对齐。**Chat** 与 **AppScaffold** 子页（设置/演示场景/Reader/MCP/Memory）均接 `expandSafeArea(SYSTEM)`。：**无自动化 Snapshot CI**；依赖 contract 同步 + `pnpm validate:gate-a` + DevEco 十场景手验。**快速手验**：[gate-a-quick-smoke.md](./gate-a-quick-smoke.md)。

## 准备

```bash
# 仓库根目录
pnpm validate:gate-a
pnpm gate-a:verify:harmony   # sync rawfile + 11 JSON + retrieval-only 字段

# 或仅同步（DevEco Run 前必跑）
bash apps/harmony/scripts/sync-mobile-contract.sh
```

DevEco：打开 `apps/harmony`，Run **entry** 模块 → 默认进入 `PreviewMenuPage`。

## 十场景 + 可选

与 Android `GateAFullScreenSnapshotTest` / iOS `GateAFullScreenSnapshotTests` **同名 fixture**。逐行验收并填入 [gate-a-scenario-signoff.md](./gate-a-scenario-signoff.md)。

| Fixture | 要点 |
| --- | --- |
| `empty-landing.json` | Landing |
| `streaming-assistant-tail.json` | Replay tail + Follow-up |
| `long-thread-scroll.json` | 条数头 + 滚动 |
| `process-timeline-tools.json` | Process / Plan / Peek |
| `hitl-clarification.json` / `hitl-tool-approval.json` | Composer HITL |
| `workbench-*` | 五 Tab + detent 44/72/98% |
| `connection-offline-error.json` | Pill + Banner + Problem |
| `workbench-sources-retrieval-only.json` | Sources「仅检索 · 无文件」 |

交互 19 条见 [native-mobile-gate-a-ui-regression.md](../../../docs/native-mobile-gate-a-ui-regression.md) 与 [native-mobile-gate-a-ui-regression-signoff.md](../../../docs/native-mobile-gate-a-ui-regression-signoff.md)。

## 深色主题 / 字号 / Reduce Motion

1. Dev Menu → **设置**（或 Chat Drawer → 设置）
2. 切换 **深色主题**、**正文字号**、**Reduce Motion**
3. 返回 Chat：Drawer / Workbench / 对话 / Composer 应即时生效（§4.3）

## 通过标准（本阶段）

- `pnpm gate-a:verify:harmony` 绿
- 十场景 signoff 表 Chat 壳无读文件错误
- UI 回归签字表鸿蒙列 19 条 ☑（与双端同清单）

**不阻塞 v1 双端 Gate A 合并**，但静态全量目标仍要求与 Android/iOS 同 fixture 名与同交互规格。
