# Native Mobile Phase B — 进度与联调启动

> 对照 [45-native-mobile-phase-b-integration.md](./45-native-mobile-phase-b-integration.md) B0～B7。
> **真 API 手验**：[native-mobile-phase-b-manual-verification.md](./native-mobile-phase-b-manual-verification.md)
> 最后更新：2026-10-30（工程态快照，非 Gate B 签字）

## B0～B7 勾选（三端）

| 里程碑 | Android production | iOS Release (`CORE_PORT`) | 鸿蒙 Core（薄 HTTP） |
| --- | --- | --- | --- |
| **B0** Port + URL + readyz + public config | ☑ | ☑ KMP bridge | ☑ `/readyz` + 骨架 |
| **B1** Session CRUD + Drawer + detail 合并 | ☑ 大部分 | ☑ 经 engine | ☑ Drawer CRUD 薄 HTTP |
| **B2** Run + SSE + cancel + pending-input | ☑ engine + Follow-up/Steer | ☑ 同 mobile-core | ☑ 薄 HTTP + Follow-up/Steer |
| **B3** 模型/推理/Skill/附件 | ☑ | ☑ | ☑（DocumentViewPicker + multipart） |
| **B4** HITL + pending 队列 UI | ☑ controlRun + Composer 映射 | ☑ Mapper + KMP（需 xcframework） | ☑ 薄 HTTP interrupt + controlRun（手验 ☐） |
| **B5** Workbench 真数据 | ◐ hydrate + series→版本 + 恢复/修改 + **focus/open** | ◐ 同 KMP + Core UI focus | ◐ hydrate + restore + focus/open 薄 HTTP |
| **B6** MCP/Memory + 恢复矩阵 | ◐ MCP + Memory + 前后台 SSE（client JVM ☑） | ◐ CoreSettingsApi 薄 HTTP | ◐ HarmonyAgentSettingsApi + 前后台 |
| **B7** Parity 扫尾 | ◐ M-CMP-13 + M-CONV-7 focus/auto-open | ◐ 同左（Release + xcframework） | ◐ M-CMP-13 + focus/auto-open UI |

**mobile-core**：JVM golden ☑（含 Workbench focus、`tool.started` auto-open、MCP/Memory 路径、Engine workbench chrome）；`pnpm mobile-core:verify:ohos`（JVM + `-PenableOhosArm64` 占位）；原生 `ohosArm64` 编译 ☐（本机无 OHOS KMP 工具链，见 `packages/mobile-core/README.md`）。

**Gate A**：`pnpm validate:gate-a` ☑（Preview 不链 Core；Android `productionImplementation`；iOS Debug `PREVIEW_PORT`）。

---

## 三端 Core 联调启动

### 共用前提

1. 启动 Harness API（与 Web 相同）：`pnpm dev` 或部署环境。
2. 确认：`curl -sS "$BASE/readyz"`、`curl -sS "$BASE/api/agent/config/public"`。
3. 登录后 Snapshot 对拍：`HARNESS_SESSION_COOKIE='…' pnpm phase-b:parity <sessionId> [runId]`。
4. 手机/模拟器与 API 同网段；Base URL 由 `HarnessAgentEndpoints.API_BASE_URL` 编译期固定（当前 production 为 `https://pipishrimp.cn`），**无** trailing slash。

### Android（production）

```bash
cd apps/android
./gradlew :app:installProductionDebug
# 或 Android Studio：Build Variant = productionDebug
```

1. 安装 productionDebug → 打开 App（Base URL 由编译期 `HarnessAgentEndpoints` 决定，设置页暂不提供输入框）。
2. **登录**（手机号 + 验证码）→ token 写入 SharedPreferences（加密存储见技术债）。
3. Drawer：会话列表 / 新建 / 重命名 / 置顶 / 删除。
4. Composer 发 Run → 流式 assistant → Stop 取消；Run 中再发 → pending-input。

验证：`cd packages/mobile-core && ./gradlew :core-data:jvmTest`、`cd apps/android && ./gradlew :app:testPreviewDebugUnitTest :app:compileProductionDebugKotlin`。

### iOS（Release + Core）

```bash
pnpm mobile-core:xcframework
cd apps/ios && xcodegen generate
xcodebuild -scheme Harness -configuration Release -destination 'platform=iOS Simulator,name=iPhone 17' build
# XCFramework 仅 arm64 slice；Release 已在 project.yml 排除 iphonesimulator x86_64
```

1. Release 包：`import HarnessMobileCore` + `CoreAgentSessionPort`。
2. 设置 API URL；登录（`CoreServices` + UserDefaults `harness_session`）。
3. Composer / Drawer 与 Android 同 Port 语义。

验证（工程）：`pnpm mobile-core:xcframework` 后上式 **BUILD SUCCEEDED**（2026-10-30）。

Debug 仍为 **Preview**（fixture），不参与 Core 联调。

### 鸿蒙（Core 薄 HTTP）

1. DevEco 打开 `apps/harmony`；**设置 → 连接** 填 API URL。
2. 登录（非 `example.com` 时走 `HarmonyCoreAuth`）。
3. **连接 → 打开 Core 联调会话** → Composer 发消息（模型/Skill 来自 public config 与 `/api/skills`）。
4. 附件：Composer「+」→ 照片/文件 → 系统文档选择器 → 上传轮询就绪后随 Run 提交 `attachmentIds`。
5. Preview 十场景：Dev Menu → fixture 列表（**不**开 `useCorePort`）。
6. Workbench：Run 中首个 tool 应 **auto-open** Sheet；TopBar / 时间线点击应 **focus** 到对应 tool（无法解析时 Toast 降级 Activity）。

自动化（本仓库 CI/本机）：`pnpm gate-a:verify:harmony` ☑ fixture；`pnpm phase-b:verify:local` ☑（JVM + Gate A + smoke-api）。

---

## 集成方式与技术债

| 端 | 集成 | 债务 |
| --- | --- | --- |
| **Android** | Gradle `includeBuild(../../packages/mobile-core)` + `productionImplementation` | Token 非加密存储；MCP+Memory+Workbench hydrate production |
| **iOS** | XCFramework + `HarnessEngineBridge` + `CoreSessionMapper` HITL | Keychain 占位；联调前跑 `pnpm mobile-core:xcframework`（含 M-CMP-13 / artifact 投影） |
| **鸿蒙** | ArkTS `HarmonyMobileEngine` 薄 HTTP + `HarmonyInterruptParser` | NAPI + 原生 ohosArm64 ☐；SSE 退避较 KMP 简化；E2/E5/E9/E28 薄 HTTP 已对齐；手验 ☐ |

**跨端 Parity 债务**：`focusWorkbench` / `followMode` / 首个 tool auto-open 已在 **mobile-core + 三端 Core UI** 接线（iOS 需 `pnpm mobile-core:xcframework` 后编 Release）；M-CONV-4～8 部分仍 Preview 级；真机手验 ☐。

---

## 命令速查

| 命令 | 用途 |
| --- | --- |
| `pnpm validate:gate-a` | Phase A 不变量 |
| `pnpm mobile-core:test` | core-test + core-data JVM |
| `pnpm mobile-core:verify:ohos` | JVM golden + ohos 工具链占位检查 |
| `pnpm mobile-core:xcframework` | iOS KMP 产物 |
| `pnpm phase-b:smoke-api` | readyz + public config；有 cookie 时 + sessions/MCP/memories |
| `pnpm phase-b:parity <sessionId> [runId]` | session + run 对拍摘要（需 cookie，推荐） |
| `pnpm phase-b:session-summary <sessionId>` | 仅 Session 摘要 |
| `pnpm phase-b:run-summary <runId>` | 仅 Run 摘要 |
| `pnpm phase-b:handoff` | 跑 `verify:ci` + 打印结项人工待办 |
| `pnpm phase-b:verify:local` | JVM golden + Gate A + API smoke（不含三端 UI） |
| `pnpm phase-b:verify:ci` | 与 CI job 同 scope（**无** smoke-api / 鸿蒙 fixture） |
| `pnpm phase-b:verify:ios-local` | macOS：xcframework + Release 编译（同 CI iOS job） |
| `pnpm phase-b:verify:repo` | local + 鸿蒙 fixture + ohos 占位（仍 **不含** 真机手验） |
| CI `native-mobile-phase-b-engine` | 同 `phase-b:verify:ci` |
| CI `native-mobile-phase-b-ios` | macOS：`xcframework` + Release 模拟器编译 |

### §8 手验进度（真 API + 三端 Core）

| ID | 场景 | Android | iOS | 鸿蒙 | 自动化/代码 |
| --- | --- | --- | --- | --- | --- |
| E1 | detail 晚到、已切 Session | ☐ | ☐ | ☐ | mobile-core + 鸿蒙 `isCurrentSelection` 不写 UI、不抢 SSE ☑ |
| E9 | 401 mid-run | ☐ | ☐ | ☐ | mobile-core abort observer + lastProblem ☑；鸿蒙 `abortRunObserversForAuth` + SSE/REST ☑ |
| E14 | createRun 后 SSE 未连 | ☐ | ☐ | ☐ | `pendingSessions` + 前后台断 SSE / 回前台 `attachRunObserver`（mobile-core + 鸿蒙）☑ |
| E15 | createRun 失败 | ☐ | ☐ | ☐ | `formatCreateRunFailureDetail` + failed assistant ☑；鸿蒙 ProblemDetails + user 保留 ☑ |
| E20 | public config 未加载 | ☐ | ☐ | ☐ | engine throw ☑ |
| E6 | 非当前 Session 后台 Run 完成 | ☐ | ☐ | ☐ | mobile-core 后台 observer ☑；鸿蒙「当前无 live Run 才挂 SSE」☑ |
| E22 | 删当前 Session 导航 | ☐ | ☐ | ☐ | mobile-core + 鸿蒙删当前时清 SSE/liveRun ☑ |
| E27 | Focus 无 workbench → Activity 降级 | ☐ | ☐ | ☐ | `WorkbenchFocusProjector` + hint ☑ |
| E11 | 长 thread 分页 | ☐ | ☐ | ☐ | 三端 Core UI + 鸿蒙薄 HTTP ☑（手验 ☐） |
| E12 | 重启后 failed / 不假续跑 | ☐ | ☐ | ☐ | `RunLiveReducer` failed 终态 golden ☑ |
| E5 | SSE 断线重连无 duplicate | ☐ | ☐ | ☐ | mobile-core duplicate/gap ☑；鸿蒙 gap→GET snapshot ☑ |
| E3 | 连点发送 | ☐ | ☐ | ☐ | `pendingSessions` → 第二条走 pending-input（三端）☑ |
| E2 | 切回 Session 不 force 覆盖 live | ☐ | ☐ | ☐ | mobile-core R6 ☑；鸿蒙 `activeLive` + cache 重绘 + R6 merge ☑ |
| E4 | 终态后立即下一条 Run | ☐ | ☐ | ☐ | 终态清 pending + `runtimeActiveFor`（三端）☑ |
| E8 | offline 恢复 Snapshot+SSE | ☐ | ☐ | ☐ | ConnectionChrome + `refreshReadiness`（三端 Core）☑ |
| M-RUN-6 | 前后台 SSE 恢复 | ☐ | ☐ | ☐ | `onAppBackground` / `onAppForeground` 三端 ☑ |
| M-CONV-7 | 时间线 → Workbench focus + pinned | ☐ | ☐ | ☐ | 三端 Core `focusWorkbench` ☑（手验 ☐） |
| E28 | restore 版本冲突 → ProblemDetails | ☐ | ☐ | ☐ | mobile-core `ApiProblem` + Android/iOS `lastProblem` ☑；鸿蒙薄 HTTP `ProblemDetailsCard` ☑ |

E7/E10/E11 等逐步骤见 [手验清单](./native-mobile-phase-b-manual-verification.md)；Gate B 前 §8 与主路径逐项 ☐→☑。

### 结项阻断（2026-10-30 工程态）

| 完成标准 | 工程证据 | 仍缺 |
| --- | --- | --- |
| 1 三端 Core 全链路 | B0–B4 代码 ☑；B5–B7 ◐ | 主路径 1–10 三端手验 ☐ |
| 2 Snapshot 对拍 | `pnpm phase-b:parity` 脚本 ☑ | cookie + 三端/Web 填 record ☐ |
| 3 mobile-core golden | `phase-b:verify:repo` JVM ☑ | 原生 **ohosArm64** 编译 ☐（工具链；JVM 占位 ☑） |
| — iOS Core 编译 | 本地 + CI `native-mobile-phase-b-ios` ☑ | 手验 Release Core ☐ |
| 4 §8 E1–E12 + 重点项 | 上表「代码/自动化」列多数 ☑ | 三端真机 ☐→☑ |
| 5 Gate A | `validate:gate-a` + harmony fixture ☑ | Preview 十场景 DevEco 点验（建议） |
