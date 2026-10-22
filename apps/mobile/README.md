# Harness Agent Mobile（皮皮虾）

Expo SDK 57 + React Native 客户端，与 Web 共用 `@harness/agent-*` 协议层，对接仓库 API（默认 `http://127.0.0.1:4318`）。

## 环境要求

| 项 | 说明 |
| --- | --- |
| Node.js | 22+（与 monorepo 一致） |
| pnpm | 10+ |
| iOS 本地构建 | Xcode **≥ 26.4**（Expo SDK 57，见 [ios-dev-build.md](./docs/ios-dev-build.md)） |
| Android | Android Studio / SDK（可选，`expo run:android`） |
| API | 本机先起后端，`curl -s http://127.0.0.1:4318/readyz` 返回 200 |

依赖安装与数据库初始化在**仓库根目录**完成（见根 [README.md](../../README.md)），不要在 `apps/mobile` 单独装一套数据库。

## 快速启动（日常联调）

**1. 启动 API + Web（根目录）**

```bash
pnpm install          # 首次
pnpm db -- deploy     # 首次 / schema 变更后
pnpm dev              # API :4318，Web :4317
```

**2. 启动 Mobile Metro（开发构建 / Dev Client）**

```bash
# 根目录
pnpm dev:mobile

# 或
cd apps/mobile && pnpm start:dev-client
```

**3. 安装并打开 Dev Client（首次或原生依赖变更后）**

Expo Go **不能**跑 Maestro，也**不包含**本项目的全部原生模块；联调 Agent API 请用 **development build**：

```bash
cd apps/mobile
npx expo run:ios      # 同 pnpm ios:dev-build
# npx expo run:android
```

**4. App 内配置 API**

- 模拟器访问本机 API：设置 → API 地址可留空（默认 `127.0.0.1:4318`）或使用 `http://127.0.0.1:4318`。
- 真机：填电脑局域网 IP，例如 `http://192.168.x.x:4318`，手机与电脑同一 WiFi。

## 常用命令

在 `apps/mobile` 下：

| 命令 | 用途 |
| --- | --- |
| `pnpm start:dev-client` | Metro（Dev Client） |
| `pnpm ios` | 打开 iOS 模拟器并用 Expo Go 启动（**仅 UI 预览**，bundle id 不同） |
| `pnpm ios:dev-build` | 本地编译 iOS Dev Client |
| `pnpm android` | Android 原生运行 |
| `pnpm typecheck` | TypeScript |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest |
| `pnpm gate:engineering` | typecheck + lint + test |
| `pnpm gate:release-prep` | 工程门禁 + Maestro 语法 + expo-doctor + API smoke |
| `pnpm smoke:api` | 对当前 API 做就绪检查 |

根目录快捷方式：`pnpm dev:mobile`、`pnpm gate:mobile`、`pnpm smoke:api`。

## Expo Go vs Dev Client

| 方式 | 命令 | 适用 |
| --- | --- | --- |
| **Dev Client**（推荐） | `pnpm dev:mobile` + `expo run:ios` | API 联调、通知、选文件、Maestro E2E |
| **Expo Go** | `pnpm ios` / `expo start` | 快速看 UI，功能受限 |

`ios/`、`android/` 由 **Continuous Native Generation** 生成（prebuild），已在 `.gitignore`；原生行为请改 `app.json` 与 config plugins，勿手改生成目录。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [AGENTS.md](./AGENTS.md) | Agent/Cursor 协作约定与 Expo 版本注意 |
| [docs/api-integration.md](./docs/api-integration.md) | API 联调与 Parity 入口 |
| [docs/ios-dev-build.md](./docs/ios-dev-build.md) | Xcode 版本、EAS 模拟器包、Maestro |
| [docs/release-gate-runbook.md](./docs/release-gate-runbook.md) | 发布前检查与 E2E |
| [docs/parity-checklist.md](./docs/parity-checklist.md) | 与 Web 功能对齐清单 |
| [maestro/README.md](./maestro/README.md) | Maestro flow 说明 |

## 故障排查

- **`npx expo-doctor`**：依赖与 SDK 兼容性（期望 21/21；Xcode 不足时可能仅 native tooling 失败）。
- **连不上 API**：确认 `readyz`、防火墙、真机是否用了局域网 IP 而非 `127.0.0.1`。
- **Maestro 找不到 `com.harness.agent`**：需 Dev Client，见 [ios-dev-build.md](./docs/ios-dev-build.md)。

更完整的 monorepo 说明见仓库根 [README.md](../../README.md)。
