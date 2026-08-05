# Agent Frontend

> 文档状态：R1 前端产品契约。`/agent` 已实现持久化 Session/Message、URL 恢复、真实 Chat SSE、Conversation 和 Composer；production 空会话不渲染空 Workbench。Development-only `/agent/preview` 已实现桌面 P3 fixture 交互；Run SSE 投影与真实工具/报告交互仍按后续阶段实现。

## 1. 产品定位

`/agent` 是面向终端用户的本地调研任务工作台，不是 Runtime Debug Console。

用户主流程：

```text
create/open session
-> submit research goal
-> clarify if blocking
-> observe progress and sources
-> steer or cancel
-> read cited Markdown report
-> reopen durable session later
```

## 2. 技术栈

```text
React
Vite
TypeScript
canonical agent-protocol
REST + SSE
Playwright
```

前端不导入 NestJS DTO、Prisma type 或后端 entity。

## 3. 信息架构

桌面端：

```text
+--------------------------------------------------------------------------------+
| Sessions | Conversation / Task Flow              | Research Workspace                    |
|----------|---------------------------------------|---------------------------------------|
| New      | User goal                             | [Activity] [Sources] [Report] [Debug] |
| session  | Clarification / steer                 | Selected/current execution            |
| history  | User-readable run progress cards      | Evidence/source list                  |
|          | Final delivery message                | Markdown report preview               |
|          | Composer                              |                                       |
+--------------------------------------------------------------------------------+
```

移动端使用主区 tabs/drawer，不允许固定三栏挤压文本。

R1 不展示 Projects、Library、Browser、Terminal、Memory 或 Worker 导航。

## 4. 四个用户层

```text
Conversation  目标、澄清、steer、交付说明
Progress      用户可读研究阶段
Workspace     Activity、Sources、Report
Debug         raw events/state，仅开发模式
```

Raw event/state 不直接渲染到前三层。

## 5. Session UX

Session 是 durable 会话：

- Sidebar 仅显示单行会话名称，不展示会话图标、更新时间或进入箭头。
- 悬停、键盘聚焦或选中会话时显示 `…`，菜单提供重命名、置顶/取消置顶和删除。
- 置顶会话排在普通会话之前；名称和置顶状态由 API 持久化。

- 新建 session
- session 历史列表
- 打开 session 恢复 messages/runs/workbench refs
- 同一 session 可发起后续 run
- 删除 session 需要确认并说明将删除报告和证据

R1 只有 local user，不显示登录或用户切换。

## 6. Composer

状态：

```text
idle
submitting
running
waiting_for_user
cancelling
terminal
```

行为：

- idle/terminal：提交新 run。
- waiting_for_user：回答当前 clarification。
- running：输入作为 steer，UI 明确标注“下一步骤生效”。
- running/cancelling：提供 cancel command。

Composer 不让用户选择 provider、API Key、toolset 或 runtime hard budget。

R1 不显示逐任务外部发送确认：部署者配置相应 API Key 后，任务会按 provider routing 自动发送所需数据。未配置或不可用时显示明确配置错误，不伪装为用户拒绝授权。

## 7. Progress

允许的用户阶段：

```text
正在规划调研
正在搜索公开来源
正在筛选可引用证据
正在撰写报告
正在复核结论与引用
正在验证引用
报告已完成
报告受证据限制
```

布局必须有稳定尺寸，状态文本变化不能推挤 Composer 或 Workspace tabs。

### Run Progress Card

Conversation 中每个 run 可以投影为 run progress card。Card 主区域是跨面板导航入口，展示用户可理解的状态、当前动作、耗时、查询数和来源数；不得展示 raw event/provider payload。

交互边界：

- 点击 card 主区域，打开 Workbench 并定位到该 run 当前/已选中的 Activity execution。
- 展开区展示独立 Progress projection 和 logical tool call rows。
- 点击 tool call row 按 `runId/stepId/toolCallId` 精确定位。
- 对应具体工具调用时，使用 `toolCallId + stepId + runId` 精确定位。
- 展开/收起只改变 card 内摘要，不打开 Workbench。
- Cancel 是独立按钮，不冒泡触发 card 导航；Steer 内容通过 Composer 提交。
- completed/failed/cancelled card 仍可打开历史 Activity。
- loading 或 snapshot 恢复期间显示稳定 skeleton/状态，不临时跳到其他 run。

## 8. Clarification

一次只展示一个阻塞问题。回答后在同一个 run 恢复。

UI 必须区分 clarification 与 steer：

- Clarification 是继续执行所必需。
- Steer 是运行中追加方向，不中断当前 action。

## 9. Steer

提交成功后展示：

```text
已接受，将从下一步骤应用
```

应用事件到达后，Progress/Conversation 显示方向已经更新。Steer 不表现为新的独立 run。

## 10. Cancel

点击 cancel 后进入 cancelling，禁用重复提交。只有收到 terminal event/snapshot 后进入 cancelled。

已完成的 Sources 和 partial Artifact 可以保留查看，但不得标记为正式完成报告。

## 11. Sources

Source list 区分：

```text
Clue      标题/URL/摘要，只用于发现线索
Evidence  有持久化原文片段，可以被 [Sx] 引用
```

Evidence item 展示：

- `[Sx]`
- title
- provider/domain
- retrieved time
- cited passage
- locator（如有）
- cited-by report anchor

Clue 不显示正式 `[Sx]`。

## 12. Report

Report tab 状态：

```text
empty
drafting
reviewing
revising
validating
completed-standard
completed-limited
failed
```

只有 completed Artifact 显示为正式报告。Markdown renderer：

- 禁止危险 HTML
- 外链 `noopener noreferrer`
- `[Sx]` 可打开 Source evidence
- 文末来源列表与内联引用联动
- limited report 显示清晰但克制的证据限制状态

## 13. Conversation Delivery

Final message 只包含：

- 报告已完成/受限
- 简短摘要
- Report Artifact card
- 关键限制（如有）

完整报告不重复塞进 Conversation。

## 14. Activity

Activity tab 显示当前或从 Conversation 选中的用户可见动作，不展示内部 action/event 名：

```text
搜索：新能源汽车交付数据
筛选可引用来源
复核报告中的数字和引用
验证 8 个来源
```

Provider routing/fallback 可以转成用户可理解状态，但不展示配置、baseURL 或内部 error body。

Activity 以 logical tool call 为最细用户可见执行单位。一次 logical call 内的 provider attempts 聚合显示；原始请求、响应和 attempts trace 只进入 development-only Debug。

桌面 Workbench 使用纵向 master/detail：上方是紧凑 execution timeline，下方是选中调用详情。普通详情可以展示脱敏业务输入和结果摘要，例如搜索词、结果数、来源数、耗时和可理解错误；不得展示 raw request/response。

Activity execution 至少关联：

```ts
type ActivityExecutionView = {
  runId: string;
  stepId: string;
  toolCallId?: string;
  status: 'pending' | 'running' | 'waiting' | 'cancelling' | 'completed' | 'failed' | 'cancelled';
  title: string;
  detail?: string;
  startedAt: string;
  completedAt?: string;
};
```

## 14.1 Cross-panel Navigation

Conversation、Sources 和 Report 不分别实现导航逻辑，统一 dispatch `FOCUS_WORKBENCH_TARGET`：

```ts
type WorkbenchFocusTarget =
  | { kind: 'activity'; runId: string; stepId?: string }
  | { kind: 'tool_call'; runId: string; stepId: string; toolCallId: string }
  | { kind: 'source'; runId: string; sourceId: string; evidenceId?: string }
  | { kind: 'report'; runId: string; artifactId?: string };
```

Reducer 必须原子地完成：

```text
open Workbench
-> select run
-> select Activity/Sources/Report tab
-> select resource
-> move focus/scroll after resource render
```

UI selection 不写入 State，也不通过控制 API 发送。目标无法解析时降级到同一 run 的 Activity 总览，并向用户说明详情暂不可用。

每个新 run 的首次 tool call 自动打开 Workbench。默认 auto-follow 当前调用；用户手动选择后变为 pinned。用户主动关闭后，当前 run 不再自动打开；新 run 重新获得一次自动打开机会。Steer/clarification 不创建新 run，因此不重置。

## 15. Projection Architecture

```text
REST snapshot / SSE event
-> canonical decoder
-> projection/reducer
-> ConversationModel
-> ProgressModel
-> SourcesModel
-> ReportModel
-> ActivityModel
-> components
```

React component 不直接 `switch(event.type)`。

## 16. Frontend State

```ts
type AgentUiState = {
  activeSessionId?: string;
  activeRunId?: string;
  connection: 'idle' | 'connecting' | 'live' | 'reconnecting' | 'offline';
  composerMode: 'new_run' | 'clarification' | 'steer';
  conversation: ConversationItem[];
  progress: ProgressItem[];
  workbenchOpen: boolean;
  sources: SourceView[];
  report?: ReportView;
  activity?: ActivityView;
  activityExecutions: ActivityExecutionView[];
  activeWorkspaceTab: 'activity' | 'sources' | 'report' | 'debug';
  workbenchFocus?: WorkbenchFocusTarget;
  workbenchFollowMode: 'auto' | 'pinned';
  autoOpenSuppressedRunIds: string[];
  lastSeq?: number;
};
```

`ConversationItem` 的 run progress card 必须携带 `runId` 和 focus target；不得依赖显示文本或数组位置反查 execution。

## 17. Recovery

加载顺序：

```text
GET session
-> GET latest/selected run
-> GET workbench snapshot
-> render recovered state
-> connect SSE from lastSeq
```

重复事件通过 eventId/seq 幂等处理。

Snapshot 恢复资源事实，`workbenchOpen/activeWorkspaceTab/workbenchFocus` 属于本地 UI selection。刷新后的默认 focus 为当前 running execution；terminal run 为最后一个用户可见 execution。显式 URL/deep link 可以覆盖默认值，但必须校验目标属于当前 session/run。

## 18. Errors

用户可见错误类别：

- 模型配置不可用
- 搜索服务不可用
- 搜索预算耗尽
- 没有可引用证据
- 报告引用验证失败
- 任务取消/超时
- 恢复失败

不展示 stack、API Key、provider raw response 或 internal State payload。

## 19. Capability Gating

Web 从 public config 获取 capability。没有真实 backend contract 的功能不显示控件/tab。

R1：research/steer/cancel/activity/report/sources，以及 Conversation 到 Workbench 的精确定位。

P9/P10：Memory management UI。

P11：Worker progress projection。

## 20. 目录

```text
features/agent/
  api/
  components/
    conversation/
    progress/
    sources/
    report/
    activity/
    debug/
  hooks/
  projection/
  state/
  types/
```

目录随阶段创建，不生成空组件。

## 21. UI 阶段

P1：route/session empty shell/composer。

P2：scripted completed conversation。

P3：SSE progress/steer/cancel fixtures，以及 run progress card/tool call rows 到 Activity 的本地交互 fixture。桌面端实现 auto-open、auto-follow/pinned、close suppression 和纵向 master/detail；移动端顶层 Workbench view 延后到 P8。

P4：session/run refresh recovery。

P5：clarification and real answer。

P6：search activity and clue preview。

P7：Sources/Report/citations/limited state。

P8：replay/errors/mobile/E2E hardening。

## 22. R1 验收

1. 桌面/mobile 无重叠和溢出。
2. session 可创建、恢复、删除。
3. clarification/steer/new run 三种 composer 模式不会混淆。
4. cancel 状态准确。
5. clue/evidence 显示不同。
6. `[Sx]` 可联动 cited passage。
7. limited report 清晰展示。
8. raw events 只在 Debug。
9. 点击 run progress card 能打开 Workbench，并按 run/step/toolCall 定位到正确 Activity execution。
10. 展开、steer、cancel 不误触发 Workbench 导航。
11. desktop/mobile、terminal run 和 snapshot recovery 的 focus 行为一致且键盘可访问。
12. SSE duplicate/replay 不重复 UI item。
13. Playwright 黄金任务通过。
