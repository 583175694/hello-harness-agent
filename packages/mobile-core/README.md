# mobile-core（Phase B）

KMP 共享引擎：**REST + SSE + Run 归约**（无 UI）。三端 Production/Core 经 `CoreAgentSessionPort` 订阅；Preview 构建 **不得** 链接本包（Gate A）。

## 模块

| 模块 | 职责 |
| --- | --- |
| `core-api` | `HarnessMobileEngine` Facade + 协议 DTO |
| `core-auth` | `harness_session` Cookie + `PlatformSessionTokenStore` |
| `core-data` | Ktor REST（readyz、public config、auth） |
| `core-engine` | B0+ 默认实现（接 core-data / core-reducer） |
| `core-test` | JVM `commonTest` + `mobile-contract` golden |

## 本地命令

```bash
cd packages/mobile-core
./gradlew :core-test:jvmTest
```

根仓库：

- `pnpm mobile-core:test` — JVM golden（`:core-test` + `:core-data`）
- `pnpm mobile-core:verify:ohos` — 同上 + `-PenableOhosArm64` 占位（原生 `ohosArm64()` 待工具链）
- `pnpm phase-b:verify:repo` — golden + Gate A + 鸿蒙 fixture（**不含** API smoke；手验前本地另跑 `pnpm phase-b:smoke-api`）

GitHub Actions：`CI` workflow 任务 **`native-mobile-phase-b-engine`**（JVM golden + Gate A + Android `productionDebug` 编译）。

iOS Core 集成（Release / `CORE_PORT`）：

```bash
pnpm mobile-core:xcframework
# 产物：packages/mobile-core/core-engine/build/XCFrameworks/release/core_engine.xcframework（Swift `import HarnessMobileCore`）
```

## 目标平台

- `androidTarget` / `iosArm64` / `iosSimulatorArm64` / `jvm()`（测试）
- **`ohosArm64`**：`gradle.properties` 中 `enableOhosArm64=true` 且在 CI 安装 OHOS KMP 工具链后启用（与 JVM **同一 domain golden**）。本地无工具链时保持 `false`；鸿蒙 Phase B 仍可用 `apps/harmony` 薄 HTTP + ArkTS golden（fixture 脚本）。

方案与里程碑：[docs/45-native-mobile-phase-b-integration.md](../../docs/45-native-mobile-phase-b-integration.md)
