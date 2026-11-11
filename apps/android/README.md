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
bash apps/android/scripts/launch-preview.sh   # 仓库根目录
```

包名 `com.harness.agent`；若 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`：`adb uninstall com.harness.agent` 后重装。手验：[`docs/gate-a-quick-smoke.md`](docs/gate-a-quick-smoke.md)。

**更流畅的手感（非 debug 包）**：仍是 Preview/Dev Menu，但装 **previewRelease**（不可调试、无 Compose tooling）：

```bash
bash apps/android/scripts/launch-preview-release.sh
```

Gate A 签字与 Paparazzi 仍以 **previewDebug** 为准；release 仅便于真机体验对比。

Fixture 与 `design-tokens.json` 在 `preBuild` 时从 `packages/mobile-contract` 同步到 `src/preview/assets/`（仅 **preview** flavor 打进 APK；**production** 正式包不含演示 JSON）。

## Production release 构建与签名

Release 开启 R8、资源压缩和资源收缩；未配置 keystore 时 Gradle 只产出 **unsigned** 包，不会回退到 debug 签名。

### 首次初始化内测签名

```bash
cd apps/android
bash scripts/setup-internal-signing.sh
```

脚本生成 `internal-release.jks` 与 `keystore.properties`（均已在 `.gitignore`，禁止提交）。**请备份这两个文件**；丢失后无法覆盖升级，只能卸载重装。

### 构建、验签与安装

```bash
cd apps/android
bash scripts/build-production-release.sh            # 只构建并验签
bash scripts/build-production-release.sh --install  # 再安装并启动当前 adb 设备
```

多设备连接时用 `ANDROID_SERIAL=<序列号>` 指定目标设备。若设备已有不同签名的 `com.harness.agent`，覆盖安装会报 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`：保留数据需找回原签名；否则 `adb uninstall com.harness.agent`（会清空应用数据）后重装。

也可以手动签名（`keystore.properties` 已在 `.gitignore`，禁止提交）：

```bash
cd apps/android
cp keystore.properties.example keystore.properties  # 然后填入真实路径与密码
./gradlew :app:assembleProductionRelease :app:assembleProductionReleaseBundle
```

CI 也可通过 `ANDROID_KEYSTORE_PATH`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD` 提供签名材料。

产物：

- APK：`app/build/outputs/apk/production/release/`
- AAB：`app/build/outputs/bundle/productionRelease/`

`targetSdk = 36`；应用已关闭备份与明文流量，正式包不包含 preview fixture 或 `profileable`。

## 自动化验证

与 CI job `native-mobile-gate-a-android` 一致：

```bash
pnpm --filter @harness/mobile-contract validate:gate-a
bash apps/android/scripts/sync-mobile-contract.sh
cd apps/android
./gradlew :app:testPreviewDebugUnitTest :app:testProductionDebugUnitTest --no-daemon
./gradlew :app:assembleProductionRelease :app:lintProductionRelease --no-daemon
```

Runbook（Paparazzi / Macrobenchmark）：[`docs/gate-a-runbook.md`](docs/gate-a-runbook.md)。任务书：[`docs/44-native-mobile-phase-a-static-ui.md`](../../docs/44-native-mobile-phase-a-static-ui.md)。
