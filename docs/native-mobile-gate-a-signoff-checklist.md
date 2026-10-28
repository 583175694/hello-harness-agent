# Gate A 关 Goal 前 — 人工签字清单（#2 / #3）

自动化与 §8.2 已就绪时，**只剩本清单 + Git 入库（#1，可稍后）**。进度：`pnpm gate-a:human-evidence` 或 `pnpm gate-a:completion`。

## 0. 启动 Preview（手验前）

| 端 | 命令 |
| --- | --- |
| Android | `pnpm gate-a:launch:android`（debug）或 **`pnpm gate-a:launch:android:release`**（手感更接近正式包；需 adb device） |
| iOS | `pnpm gate-a:launch:ios`（build + 装到 iPhone 17 模拟器并 launch） |
| 鸿蒙 | `pnpm gate-a:launch:harmony`（sync rawfile）→ DevEco Run **entry** |

本地可先跑 **`pnpm gate-a:verify:all`**（macOS）确认自动化仍绿。**启动即进入 Agent Chat 主界面**（默认 `empty-landing.json`，UI 可交互）。**综合 Mock 最快路径**：空态首页点 **「加载演示 Mock（对话 + 工作台）」** → 进入 `rich-session-showcase.json`；或 **设置 → 演示场景**（列表置顶 `rich-session-showcase.json`、`stock-market-review.json`），再按 quick-smoke 顺序验其余场景。每行 subtitle 即 fixture 文件名；三端亦带 **`dev-menu-fixture-<fileName>`** 测试标识（Android `testTag` / iOS accessibility / 鸿蒙 `ListItem.id`）。空态一键 Mock：**`landing-load-demo-mock`**（Android/iOS）。

**三端手验提示（edge-to-edge）**：顶栏应在状态栏下方；Composer 贴底；点 **+ / 模型 / 工作台** 弹出全屏蒙层 Sheet，应**盖住 Composer**；Workbench 内容区可上下滑，无 Context Tab。在 **空态** 手动打开工作台会看到「暂无过程记录」——属预期；请先加载演示 Mock 或切换含 workbench 的 fixture。

## 1. 三端快速手验（约 10 分钟 / 端）

| 端 | 文档 | 填表 |
| --- | --- | --- |
| Android | [gate-a-quick-smoke.md](../apps/android/docs/gate-a-quick-smoke.md) | [UI 回归签字](./native-mobile-gate-a-ui-regression-signoff.md) **Android 列**（19 格 ☑ + 日期） |
| iOS | [gate-a-quick-smoke.md](../apps/ios/docs/gate-a-quick-smoke.md) | **iOS 列** |
| 鸿蒙 | [gate-a-quick-smoke.md](../apps/harmony/docs/gate-a-quick-smoke.md)（11×30s） | **鸿蒙列** + [十场景签字](../apps/harmony/docs/gate-a-scenario-signoff.md)（11 行 ☑） |

手验顺序与 UI 回归 # 的对应见各端 quick-smoke 表格「UI 回归 / 备注」列。可选：同 fixture 与 RN `apps/mobile` Preview 并排对照（VIA：顶栏/Composer 圆角壳/Workbench 黑底 Tab/用户气泡边框；见 2026-10-28 三端对齐提交）。

## 2. 验收标准

- [UI 回归 19 条](./native-mobile-gate-a-ui-regression-signoff.md)：三端列均为 ☑，且「签字日期」列有日期。
- [鸿蒙十场景](../apps/harmony/docs/gate-a-scenario-signoff.md)：11 fixture 行相关格 ☑ + 日期。
- §8.2：Android/iOS [runbook](../apps/android/docs/gate-a-runbook.md) 已有 dated 行（2026-10-28 模拟器；可选真机复测）。

## 3. 验证

```bash
pnpm gate-a:completion       # validate + human-evidence + 列出 audit 中 ❌
pnpm gate-a:human-evidence   # 期望 57/57、32/32，runbook 已填
```

签字表单元格请写 **☑**（或 `[x]`），并在「签字日期」列填 **2026-10-28**（或实际手验日）。  
- **UI 回归表**：Android / iOS / 鸿蒙 三列空白格填 ☑。  
- **鸿蒙十场景表**：把行内 **☐ 改成 ☑**（`pnpm gate-a:human-evidence` 只计 ☑，不计 ☐）。

## 4. 入库（#1，签字完成后再做）

```bash
pnpm gate-a:prep-commit      # 看建议 git add 范围
# 对 Agent 说：「按 prep-commit 范围提交」（仅 commit，不 push，除非你另要求）
```

Goal 关闭：上项完成 + [completion-audit](./native-mobile-gate-a-completion-audit.md) 无 ❌。
