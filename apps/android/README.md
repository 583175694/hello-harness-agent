# Harness Android（Native Mobile Phase A）

Compose + `core-ui` primitives；Phase A 仅 **`preview` flavor** + `PreviewAgentSessionPort`。

## 打开 Preview / Dev Menu

1. 用 Android Studio 打开 **`apps/android`**（Gradle sync）。
2. 选择 Build Variant：**`previewDebug`**（默认 flavor）。
3. Run `app` → 启动即 **Preview / Dev Menu**，点选十场景之一进入 Chat 预览壳。

命令行（需 SDK + 模拟器/设备）：

```bash
cd apps/android
./gradlew :app:assemblePreviewDebug
./gradlew :app:installPreviewDebug
```

### 真机 USB 调试

1. 手机开启 **USB 调试**，连 Mac 并在手机上授权。
2. `adb devices` 应显示 `device`（非 `unauthorized`）。多设备时：`export ANDROID_SERIAL=<序列号>`。
3. 仓库根目录一键安装并启动 Preview / Dev Menu：

```bash
pnpm gate-a:launch:android
```

包名 `com.harness.agent`；若 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`：`adb uninstall com.harness.agent` 后重装。手验：[`docs/gate-a-quick-smoke.md`](docs/gate-a-quick-smoke.md)。

**更流畅的手感（非 debug 包）**：仍是 Preview/Dev Menu，但装 **previewRelease**（不可调试、无 Compose tooling）：

```bash
pnpm gate-a:launch:android:release
```

Gate A 签字与 Paparazzi 仍以 **previewDebug** 为准；release 仅便于真机体验对比。

Fixture 与 `design-tokens.json` 在 `preBuild` 时从 `packages/mobile-contract` 同步到 `assets/`。

RN 对照入口：`apps/mobile/app/preview/index.tsx` → `/preview/agent`。

## Gate A 验证

```bash
# 仓库根目录
pnpm gate-a:verify:android
pnpm gate-a:verify:all    # macOS：Android + 鸿蒙 assert + iOS Snapshot
```

Runbook（Paparazzi / Macrobenchmark）：[`docs/gate-a-runbook.md`](docs/gate-a-runbook.md)。任务书：[`docs/44-native-mobile-phase-a-static-ui.md`](../../docs/44-native-mobile-phase-a-static-ui.md)。
