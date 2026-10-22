# Maestro E2E（P8 Release Gate）

与 [docs/36 §12.2](../../../docs/36-mobile-agent-frontend.md#122-maestro-e2e最低集) 对齐的最低自动化集。

## 前置

1. 安装 [Maestro CLI](https://maestro.mobile.dev/getting-started/installing-maestro)（仓库脚本：`bash apps/mobile/scripts/install-maestro.sh`；或 `brew install mobile-dev-inc/tap/maestro`）。
2. 本机 API 已启动（默认 `http://127.0.0.1:4318`），且 `GET /readyz` 为 200。
3. Metro：`pnpm dev:mobile` 或 `expo start --dev-client`（EAS / `expo-dev-client` 开发构建）。
4. iOS 模拟器或 Android 模拟器已安装 **开发构建**（`com.harness.agent`）。  
   - **Xcode**：Expo SDK 57 需 **Xcode ≥ 26.4**（`expo-doctor`）；Xcode 16.x 会因 `expo-modules-jsi` 要求 Swift 6.2 导致 `ExpoModulesJSI` xcframework 编译失败。  
   - 仓库默认 `pnpm --filter @harness/mobile ios` 走 **Expo Go**，bundle id 不同，**不能**直接跑 Maestro。  
   - 本地 Xcode ≥26.4：`pnpm ios:dev-build`  
   - 或 EAS：`pnpm ios:simulator:eas` → `pnpm ios:simulator:install <.tar.gz>`（见 `docs/ios-dev-build.md`）  
   - Maestro CLI：`bash apps/mobile/scripts/install-maestro.sh`，并 `export PATH="$PATH:$HOME/.maestro/bin"`。

Flow 内用 `tapOn: '…'`（Maestro `text` 选择器，对应 RN `accessibilityLabel`），勿用已废弃的 `accessibilityLabel` 键。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `HARNESS_API_URL` | 真机联调时在 App **设置** 里填写的 API Base URL（Maestro 用例内通过 Deep Link / 设置流配置，见各 flow 注释） |

## 运行

```bash
cd apps/mobile
pnpm test:maestro:syntax   # 无设备：仅校验 YAML
pnpm test:maestro:preflight # 推荐先跑：Maestro + 模拟器 dev build + smoke:api
pnpm test:maestro          # p2-smoke（含 preflight）
pnpm test:maestro:all      # preflight + 六条 flow
pnpm test:maestro:e2e      # 同 all，带 E2E 说明 banner
pnpm test:maestro:run      # 仅 flow（已预检时）
```

| Flow | 覆盖（docs/36 §12.2） |
| --- | --- |
| `p2-smoke.yaml` | 创建 Session + 简单 Run |
| `session-switch.yaml` | 切换 Session 不串消息 |
| `settings-api-ready.yaml` | 配置 API + ready → Composer 可输入 |
| `settings-mcp.yaml` | Settings MCP 列表与 API 一致 |
| `kill-relaunch.yaml` | 杀 App 重启后会话/消息恢复 |
| `workbench-open.yaml` | 打开 Workbench（实时跟随；Sources 见 Activity emphasis + 手工矩阵） |

iOS 构建失败排查：[../docs/ios-dev-build.md](../docs/ios-dev-build.md)。
