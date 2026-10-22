# §14 Release Gate Runbook

对照 [docs/36 §14](../../../docs/36-mobile-agent-frontend.md#14-验收标准release-gate) 与 [parity-checklist.md](./parity-checklist.md)。

## 工程门禁（CI / 合并前）

对应 **docs/36 §14 第 7 条**：`pnpm check`（含 packages + mobile typecheck）。

```bash
# 仓库根目录
pnpm check
pnpm gate:mobile              # mobile 工程预检 + Maestro 语法 + smoke:api
pnpm smoke:api
pnpm test:maestro:syntax
pnpm test:maestro:preflight   # E2E 前（需 dev build）
pnpm ios:simulator:eas        # 需 eas login
pnpm test:maestro:e2e          # 需 com.harness.agent + Metro
```

含 shared packages、Web、API、Mobile typecheck/lint/test/build。GitHub **`.github/workflows/ci.yml`**：`check` job 跑 `pnpm check`；`maestro-syntax` job 跑 **六条** flow 语法（无模拟器）。

| 项 | 状态 | 证据 |
| --- | --- | --- |
| §14.7 `pnpm check` | ✅ 已验 | 2026-10-21 复验 exit 0（Web Vitest `testTimeout: 10s`、`expo-dev-client`、Maestro 六条 syntax） |
| Mobile 子集 | ✅ 已验 | `pnpm --filter @harness/mobile gate:engineering`；可选 `pnpm gate:release-prep`（含 Maestro 语法 + expo-doctor） |

§14 第 1–6 条（真机 / Maestro / Snapshot 对照）仍须下表签字。

### 环境状态（2026-10-21）

| 检查 | 结果 |
| --- | --- |
| `npx expo-doctor`（mobile） | **20/21**；仅 **Xcode ≥ 26.4** 未满足（本机 16.2 → 无法 `expo run:ios`） |
| `pnpm test:maestro:syntax` | ✅ 六条 flow（含 `settings-api-ready`；Maestro 2.11） |
| Native 构建说明 | [ios-dev-build.md](./ios-dev-build.md) |

## Maestro（Native 冒烟）

前置：Maestro CLI、`pnpm dev` + API readyz、Expo 开发构建 `com.harness.agent`。

```bash
bash apps/mobile/scripts/install-maestro.sh   # 或 brew install mobile-dev-inc/tap/maestro（curl 慢时推荐）
export PATH="$PATH:$HOME/.maestro/bin"
cd apps/mobile
pnpm smoke:api             # /readyz + public config（需 pnpm dev API）
pnpm test:maestro:syntax   # 无模拟器：六条 flow YAML 语法 OK
pnpm test:maestro:preflight # CLI + 模拟器 com.harness.agent + API（E2E 前）
npx expo run:ios           # 首次：安装 com.harness.agent（Expo Go 不能跑 Maestro）
pnpm test:maestro          # p2-smoke
pnpm test:maestro:all      # 六条 §12.2 flow（含 settings-api-ready、kill-relaunch）
pnpm test:maestro:e2e      # 同 test:maestro:all（带说明 banner）
pnpm snapshot:compare <runId> [sessionId]  # §14 双端 Snapshot 对照辅助
```

## 手工矩阵（真机签字）

| # | 用例 | 通过 |
| --- | --- | --- |
| 1 | 同一 Session Run：Mobile 与 Web conversation block 顺序一致（以 Snapshot 为准） | ☐ |
| 2 | Clarification / Steer / Follow-up / Cancel 不混淆 | ☐ |
| 3 | SSE replay 不重复 UI item | ☐ |
| 4 | 点 Tool Activity **≤3s** 定位 Workbench `toolCallId` | ☐ |
| 5 | Mobile 改 MCP → Web Settings 可见（反之亦然） | ☐ |
| 6 | 杀 App → 再进同一 Session，Run 状态合理（Snapshot + SSE） | ☐ |
| 7 | 后台 Run 完成 → 本地通知 → 点击深链回 Session | ☐ |
| 8 | 局域网 API URL；真机不用 `localhost` | ☐ |

## Snapshot 对照（与 Web）

```bash
SESSION_ID="<uuid>"
RUN_ID="<uuid>"
curl -s "http://127.0.0.1:4318/api/agent/runs/${RUN_ID}" | jq '.conversationBlocks, .workbench'
curl -s "http://127.0.0.1:4318/api/agent/sessions/${SESSION_ID}" | jq '.session.messages | length'
```

在 Mobile 与 Web 打开同一 `session`/`run`，对比 block 顺序与 tool 状态。

---

## docs/36 §14 与证据类型

| §14 条 | 验收要点 | 当前证据 |
| --- | --- | --- |
| 1 | §4 矩阵可演示或自动化 | 代码 + `parity-checklist.md`；Maestro 六条 flow（E2E 待跑） |
| 2 | 双端 block 顺序一致 | 手工 + `pnpm snapshot:compare` |
| 3 | Clarification / Steer / Follow-up / Cancel | 手工矩阵 #2 |
| 4 | SSE replay 不重复 | `agent-run-state` 单测 + 手工 #3 |
| 5 | Tool Activity ≤3s 定位 Workbench | 手工 #4 |
| 6 | MCP 双端 Settings 同步 | Maestro `settings-mcp` + 手工 #5 |
| 7 | `pnpm check` | CI + 本机 exit 0 |

---

## 工程完成 vs Release 签字（2026-10-21）

| 维度 | 状态 |
| --- | --- |
| P0–P7 代码 / 共享包 / Web 迁包 | ✅ `parity-checklist.md` |
| §14.7 `pnpm check` | ✅ |
| Maestro flow 语法 | ✅ 6 条 flow，`pnpm test:maestro:syntax` |
| Dev build 安装 | ⏳ 本机 Xcode 16.2；或 **`eas login`** / `EXPO_TOKEN` 后 `pnpm ios:simulator:eas` → **`pnpm ios:simulator:install <.tar.gz>`**（[ios-dev-build.md](./ios-dev-build.md)） |
| §14 手工矩阵 1–8 | ☐ 须负责人签字 |
| Goal **P0→P8 完成** | **未达成**（缺 §14 1–6 证据） |
