# Android Gate A Runbook

## Snapshot（Paparazzi）

```bash
cd apps/android
./gradlew :app:verifyPaparazziPreviewDebug
# 更新基线：
./gradlew :app:recordPaparazziPreviewDebug
```

覆盖：`GateAChromeSnapshotTest`、`GateAFixtureSnapshotTest`（含 **Artifact / Context Tab**、**恢复确认**、**Passage 半屏** 快照）、`GateAReaderSnapshotTest`（Report / Artifact 全屏 Reader，#15）、`GateASettingsSnapshotTest`（Settings 根 + MCP 列表，#16/#17）、`GateAFullScreenSnapshotTest`（十场景整屏 Chat 壳）、`GateAWorkbenchDetentSnapshotTest`（Workbench 44% 低档露出 Composer，UI 回归 #2）。

Preview APK Dev Menu 顶栏 **设置** 行可直达 Settings（不必先进 Chat Drawer）。

**快速手验（填签字表前）**：[gate-a-quick-smoke.md](./gate-a-quick-smoke.md)

## 长列表 Macrobenchmark

场景 fixture：`long-thread-scroll.json`（Dev Menu「长会话压测」）。验收见 [44 §8.2](../../../docs/44-native-mobile-phase-a-static-ui.md)（中位 ≥55fps、严重掉帧 <5%）。

1. `./gradlew :app:assemblePreviewDebug` 安装 Preview APK（或 Android Studio Run **previewDebug**）。
2. 打开 App → Dev Menu → **长会话压测**（可先 Dev Menu **设置** 设主题/字号）。
3. 连接真机或 API 29+ 模拟器，执行：

```bash
# 无 adb 时会尝试启动 GATE_A_ANDROID_AVD（默认 Medium_Phone_API_36.0）
bash scripts/run-gate-a-long-thread-benchmark.sh

# 或已有 device 时：
./gradlew :macrobenchmark:connectedPreviewBenchmarkAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=com.harness.agent.macrobenchmark.LongThreadScrollBenchmark
```

4. 在 `macrobenchmark/build/outputs/` 或 Android Studio **Benchmark** 面板查看 `LongThreadScrollBenchmark` 的 `FrameTimingMetric`，记录中位帧时间与掉帧比例，填入下表。

| 日期 | 设备 | 场景 | 中位 FPS | 严重掉帧 % | 备注 |
| --- | --- | --- | --- | --- | --- |
| 2026-10-28 | Medium_Phone_API_36.0 (API 36 AVD) | `long-thread-scroll` | 59.4 | 4.9 | `pnpm gate-a:benchmark:android`；P50 frameDuration 16.8ms；FrameTiming 391 帧中 >33.4ms 占 4.9%；**模拟器+debuggable 抑制**，真机复测建议 |

## Preview APK

```bash
./gradlew :app:assemblePreviewDebug
```
