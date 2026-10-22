# iOS 开发构建（Maestro / `com.harness.agent`）

Expo Go（`host.exp.Exponent`）**不能**用于 §14 Maestro：flow 的 `appId` 为 `com.harness.agent`，需 **development build**。

## 前置

| 项 | 要求 |
| --- | --- |
| Xcode | **≥ 26.4**（Expo SDK 57，`npx expo-doctor`） |
| Swift | `expo-modules-jsi` 的 SPM 包声明 **Swift 6.2**；Xcode 16.x（Swift 6.0）会在 `Build ExpoModulesJSI xcframework` 失败 |
| API | `curl -s http://127.0.0.1:4318/readyz` → 200 |
| Metro | `pnpm dev:mobile` 或 `expo start --dev-client`（EAS / `expo run:ios` 开发构建） |
| Dev Client | 已依赖 **`expo-dev-client`**（`eas.json` `simulator` profile 含 `developmentClient: true`） |

## 命令

```bash
cd apps/mobile
npx expo-doctor          # 期望 21/21；Xcode 不足时仅 native tooling 失败
npx expo run:ios         # 同 pnpm ios:dev-build
```

`ios/`、`android/` 由 prebuild 生成，已在 `.gitignore`；勿手改 native 工程。

## 常见失败

### `ExpoModulesJSI` / Swift tools version

```
xcodebuild: error: Could not resolve package dependencies:
  package 'apple' is using Swift tools version 6.2.0 but the installed version is 6.0.0
```

**处理**：升级 Xcode 至 Expo SDK 57 兼容版本（见 [expo-sdk-xcode-compatibility](https://expo.fyi/expo-sdk-xcode-compatibility)），再 `cd ios && pod install && cd .. && npx expo run:ios`。

### 本机 Xcode 不足时：EAS 模拟器包

仓库已含 [`eas.json`](../eas.json) 的 `simulator` profile，在 Expo 云端用兼容 Xcode 编译，再装到本机模拟器（需 [Expo 账号](https://expo.dev)）：

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli build:configure   # 首次：关联 Expo 项目（写入 app.json extra.eas.projectId）
pnpm ios:simulator:eas        # 或 EXPO_TOKEN=… pnpm ios:simulator:eas
# 构建完成后下载 .tar.gz
pnpm ios:simulator:install ~/Downloads/*.tar.gz
```

然后 `pnpm test:maestro:preflight` → `pnpm dev` + `pnpm test:maestro:all`（Maestro CLI 见 `scripts/install-maestro.sh`）。

**CI / 无交互**：设置 [EXPO_TOKEN](https://docs.expo.dev/accounts/programmatic-access/) 后可在脚本中调用 `eas build --non-interactive`。

### Maestro `Failed to launch com.harness.agent`

模拟器未安装 dev build。先完成 `expo run:ios`，再 `pnpm test:maestro`。

### iOS 26.5 Simulator「Duplicate of …」/ `simctl list runtimes` 无 26.5

同一套 iOS 模拟器 runtime 被装了两次（常见于 **Xcode → Settings → Components** 与 **`xcodebuild -downloadPlatform iOS`** 并行）时，CoreSimulator 会多一条 `Unusable - Duplicate of <UUID>` 记录，`list runtimes` 可能只剩旧版本。

1. 只保留一种安装方式，不要同时点 UI 下载和 CLI 下载。
2. 查看：`xcrun simctl runtime list -v`（找 `State: Ready` 与 `Unusable`）。
3. **仅**删除 `Unusable` 那条：`xcrun simctl runtime delete <Unusable-UUID>`（不要删 `Ready` 的 UUID）。
4. 验证：`xcrun simctl list runtimes` 应含 `iOS 26.5`；`/Library/Developer/CoreSimulator/Volumes/iOS_23F77` 存在。
5. 若仍异常：在 Components 里删掉带红 X 的重复项，再只通过 Components **或** `xcodebuild -downloadPlatform iOS` 重装一次。勿反复 `killall CoreSimulatorService`（可能把正在安装的 runtime 标成 Deleting）。

## 日常联调（非 Maestro）

```bash
pnpm --filter @harness/mobile ios   # Expo Go + `expo start`（bundle id 不同，不能跑 Maestro）
pnpm dev:mobile                    # 开发构建 + `expo start --dev-client`（Maestro / API 联调）
```
