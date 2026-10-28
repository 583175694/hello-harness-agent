# iOS Gate A Runbook

## Snapshot（swift-snapshot-testing）

```bash
cd apps/ios
xcodegen generate
xcodebuild test \
  -scheme Harness \
            -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:HarnessTests
```

- `GateASnapshotTests`：连接态 Chrome + Peek + Composer Overlay + **Settings 根 / MCP 列表**（#16/#17）  
- `GateAFixtureSnapshotTests`：fixture 驱动 Composer / Workbench 表面（含 **Artifact / Context Tab**、**恢复确认**、Passage 半屏）  
- `GateAFullScreenSnapshotTests`：十场景整屏 Chat 壳（390×844，`suppressAutoWorkbench`）
- `GateAWorkbenchDetentSnapshotTests`：Workbench `initialSheetIndex=0` 展开，验证 44% 露出 Composer（#2）  
- `GateAThemeSnapshotTests`：深色 + 17px 整屏 Landing（对齐 Android Paparazzi 主题用例）

Dev Menu 列表首行 **设置** 可直达 Settings（不必先进 Chat Drawer）。

**快速手验（填签字表前）**：[gate-a-quick-smoke.md](./gate-a-quick-smoke.md)

首次缺失基线时会在 `HarnessTests/__Snapshots__/` 生成 PNG，需提交仓库。  
**整库重录**（模拟器/OS 升级后）：`TEST_RUNNER_SNAPSHOT_RECORD=1 xcodebuild test -scheme Harness -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:HarnessTests`（`xcodebuild` 需用 `TEST_RUNNER_` 前缀；`SnapshotTestConfig` 同时识别 `SNAPSHOT_RECORD` 与 `TEST_RUNNER_SNAPSHOT_RECORD`，重录模式为 `.all`）

## Preview 构建

```bash
xcodebuild -scheme Harness -destination 'platform=iOS Simulator,name=iPhone 17' build
```

## 长列表（Instruments / 自动化）

场景：`long-thread-scroll.json`（Dev Menu「长会话压测」）。验收见 [44 §8.2](../../docs/44-native-mobile-phase-a-static-ui.md)（中位 ≥55fps、严重掉帧 <5%）。

**自动化（Simulator）**：

```bash
pnpm gate-a:benchmark:ios          # 安装 + launch -GateAScrollPerf → Documents/gate-a-scroll-perf.json
pnpm gate-a:benchmark:ios:summary  # 读 apps/ios/build/gate-a-scroll-perf.json
```

**手工（Instruments，真机建议）**：

1. `xcodebuild -scheme Harness -destination 'platform=iOS Simulator,name=iPhone 17' build`，Xcode Run **Harness**。
2. Dev Menu → **长会话压测**（或 Settings 先设好主题/字号再进入）。
3. **Product → Profile**（或 `Cmd+I`）→ 模板 **Core Animation** 或 **Animation Hitches**。
4. 录制后在对话 `List` 内 **快速 flick 滚动** 10～15 秒，停止录制。
5. 记录：FPS 曲线中位数、Hitch 占比（或 CA 帧时间 >16.7ms 比例），填入下表。

| 日期 | 设备 / Simulator | 场景 | 中位 FPS | 严重掉帧 % | 备注 |
| --- | --- | --- | --- | --- | --- |
| 2026-10-28 | iPhone 17 Simulator | `long-thread-scroll` | 60.0 | 0.1 | `pnpm gate-a:benchmark:ios`（`-GateAScrollPerf` + CADisplayLink；851 帧） |

## 一键（仓库根目录）

```bash
pnpm gate-a:verify:ios
pnpm gate-a:verify:all   # macOS：Android + 鸿蒙 + iOS
```
