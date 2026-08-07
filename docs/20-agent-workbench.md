# Research Workbench

> 文档状态：Greenfield R1 Workbench 交互规范。

## 1. 定位

Workbench 是 Agent 执行调研时的可视化工作环境，不是 raw tool result、provider trace 或 raw State 浏览器。Activity 可以展示用户可理解的 logical tool execution，但不得退化成内部调用参数和响应查看器。

```text
Conversation  任务沟通和交付
Progress      用户可读执行过程
Sources       线索和可引用证据
Report        报告生命周期与最终 Artifact
Activity      当前动作
Debug         内部排查
```

## 2. R1 Tabs

```text
Activity
Sources
Report
Debug (development only)
```

Activity 是一等 tab，承载当前/已选中的用户可见执行详情。Workspace header 只保留当前状态摘要，不替代 Activity 内容。

R1 不创建 Browser、Terminal、Files、Memory 或 Workers 空 tab。

Tab 可用性：

- Activity：Workbench 打开时始终存在。
- Sources：当前 run 已有 source projection 时出现。
- Report：当前 run 已有 draft/final report projection 时出现。
- Debug：仅 development config 启用时出现。

## 3. WorkspaceResource

```ts
type WorkspaceResource = ActivityResource | SourceResource | ReportResource | DebugResource;

type ActivityResource = {
  id: string;
  type: 'activity';
  runId: string;
  stepId: string;
  toolCallId?: string;
  kind: 'planning' | 'searching' | 'selecting_evidence' | 'drafting' | 'reviewing' | 'validating';
  status: 'pending' | 'running' | 'waiting' | 'cancelling' | 'completed' | 'failed' | 'cancelled';
  title: string;
  detail?: string;
  startedAt: string;
  completedAt?: string;
};

type SourceResource = {
  id: string;
  type: 'source';
  kind: 'clue' | 'evidence';
  runId: string;
  title: string;
  url: string;
  provider: string;
  retrievedAt: string;
  preview?: string;
  evidenceId?: string;
  displayId?: string;
  citedBy?: string[];
};

type ReportResource = {
  id: string;
  type: 'report';
  runId: string;
  status: 'drafting' | 'reviewing' | 'revising' | 'validating' | 'completed' | 'failed';
  quality?: 'standard' | 'limited';
  artifactId?: string;
};
```

## 4. Activity Tab

Activity 顶部固定高度，展示：

- activity icon
- 当前动作标题
- 可选简短 detail
- running/waiting/cancelling 状态

示例：

```text
Searching
正在查找中国新能源汽车交付数据
```

其下展示当前 run 的稳定阶段和用户可见 logical tool execution。每个 execution 必须具有稳定的 `stepId`，工具调用存在时还必须携带 `toolCallId`，以支持从 Conversation 精确定位。

桌面端采用纵向 master/detail：

```text
compact execution timeline
-> selected execution detail
```

时间线位于详情上方，适配窄 Workbench。用户手动选择 execution 后进入 pinned 模式；在此之前 Activity 默认跟随当前 logical tool call。Pinned 状态下后续调用只更新列表和未读/运行状态，不抢占详情。

Activity 允许展示：

- 用户可理解的动作名称和状态。
- 开始/完成时间、耗时、查询数、来源数等安全聚合指标。
- fallback、重试、超时的用户可理解摘要。
- completed/failed/cancelled 历史 execution。

不得展示 provider request body、model action JSON、内部 event name、完整 provider response 或 Debug trace。一次 logical tool call 内的 provider attempts 默认聚合显示；只有 Debug 可以展开内部 attempts。

## 5. Sources Tab

来源按 run 聚合，可按状态过滤：

```text
All / Cited / Evidence / Clues
```

这些过滤器只有在确有数据时出现，不创建空 category。

### Clue Card

展示 title、domain/provider、snippet preview 和 URL。

明确状态：

```text
线索，未作为正式证据引用
```

不显示 `[Sx]`。

### Evidence Card

展示：

```text
[S3] Source title
provider · retrieved time
quoted passage
locator
Used in: report anchors
```

点击 `[S3]` 或报告 citation 时互相定位。

## 6. Report Tab

状态 UI：

```text
Drafting      生成草稿
Reviewing     检查覆盖度、证据和引用
Revising      按 review 修订
Validating    确定性验证 display IDs
Completed     正式报告
Limited       正式但证据受限的报告
Failed        无可交付报告
```

只有 final completed Artifact 可下载/打开为正式报告。Draft 可以显示 activity preview，但不提供误导性的“最终报告”操作。

## 7. Markdown Citation UX

内联引用 `[S1][S3]`：

- 可点击。
- hover/focus 展示 title + passage preview。
- 点击切换到 Sources 并聚焦对应 evidence。
- 键盘可访问。
- 不因引用数量改变段落布局宽度。

来源列表中 URL 使用安全外链属性。

## 8. Limited Report

Limited 是报告质量，不是失败或警告弹窗。

Report header 展示：

```text
证据受限
部分问题缺少足够的可引用来源，报告已明确标出未确认结论。
```

必须保留完整可验证引用，不能因为 limited 放宽 CitationValidator。

## 9. Progress Projection

Progress 是少量稳定步骤，不是每个 event 一项：

```text
Plan research
Search sources
Select evidence
Draft report
Review and revise
Validate citations
Deliver
```

每项 status：pending/running/completed/failed/cancelled。Progress item 可以链接到对应 Activity execution，但动态 provider attempts 不无限增长 checklist。

## 10. Conversation

Conversation 显示：

- user goal
- clarification question/answer
- accepted steer
- concise progress announcements
- ordered text/tool activity blocks
- final delivery card

不显示 raw search result list、ReportReview JSON 或 citation validator internals。

### Inline Tool Activity

Conversation 使用有序 text/tool activity blocks 透明展示某次 logical tool call。Activity 只包含动作名称、状态、耗时和安全聚合摘要，不展示 raw payload。

- `tool.started` 在真实发生位置插入一个稳定 block。
- `tool.completed/failed/cancelled` 按 `toolCallId` 原位更新，不追加第二条记录。
- 点击 Activity：打开 Workbench 的 Activity tab，并按 `runId + stepId + toolCallId` 精确定位。
- terminal Activity 仍可打开历史 execution；状态必须同时使用图标和文字表达。

```ts
type ToolActivityBlock = {
  id: string;
  type: 'tool_activity';
  toolCallId: string;
  toolName: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  title: string;
  summary?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
};
```

### Conversation / Workbench 联动

所有跨面板导航统一表达为：

```ts
type WorkbenchFocusTarget =
  | { kind: 'activity'; runId: string; stepId?: string }
  | { kind: 'tool_call'; runId: string; stepId: string; toolCallId: string }
  | { kind: 'source'; runId: string; sourceId: string; evidenceId?: string }
  | { kind: 'report'; runId: string; artifactId?: string };
```

导航行为：

1. 设置 `open = true`。
2. 切换到目标 `runId` 的 Workbench projection。
3. 根据 target 切换 `activeTab`。
4. 设置对应 active resource，并将键盘 focus/scroll 移到目标标题。
5. 如果目标尚未出现在当前增量 projection，先使用 snapshot 恢复；仍不存在时降级到该 run 的 Activity 总览并显示“执行详情暂不可用”，不得定位到错误调用。

映射规则：

```text
inline tool activity              -> Activity + step/tool call
[Sx] / source link                  -> Sources + source/evidence
Open report / Artifact card         -> Report + artifact
```

`open`、`activeTab` 和 `focusTarget` 是本地 UI selection，不写入 durable State，也不由 SSE 作为命令下发。

自动打开规则：

1. 每个新 run 的首次 logical tool call 自动打开 Workbench，并进入 auto-follow 模式。
2. 同一 run 的后续调用不重新执行 open；auto-follow 模式只更新选中项。
3. 用户手动选择 execution 后进入 pinned 模式，后续调用不改变 focus。
4. 用户主动关闭 Workbench 后，当前 run 进入 auto-open suppressed；该 run 后续调用不得再次自动打开。
5. 新 run 重新获得一次首次 tool call 自动打开机会。Steer 和 clarification 继续原 run，不重置该机会。

## 11. Final Delivery Card

```text
Research report ready / Evidence-limited report ready
short summary
source count
report quality
[Open report]
```

Open report 打开 Workbench 并聚焦 Report tab。完整正文不重复渲染到 Conversation。

## 12. Cancelled / Failed

Cancelled：展示已完成 progress、已发现 sources 和明确未完成状态；partial draft 不标正式交付。

Failed：展示用户可理解 reason 和 retry/new run command。Debug details 只在 Debug。

## 13. Recovery

Workbench 可以完全从 snapshot 重建：

- activity from run phase
- activity executions from user-visible step/tool projections
- sources from search/evidence records
- report from Artifact/report facts
- progress from projection rules
- open/active tab/focus target from local UI state

SSE 只增量更新，不是唯一状态源。

刷新后不要求恢复上一次临时 focus；默认选择当前 running execution，或 terminal run 的最后一个用户可见 execution。URL/deep link 显式携带合法 target 时可以覆盖默认值。

## 14. Reducer

```ts
type WorkbenchState = {
  runId?: string;
  open: boolean;
  activity?: ActivityView;
  activityExecutions: ActivityResource[];
  progress: ProgressItem[];
  sources: SourceView[];
  report?: ReportView;
  activeTab: 'activity' | 'sources' | 'report' | 'debug';
  focusTarget?: WorkbenchFocusTarget;
  followMode: 'auto' | 'pinned';
  autoOpenSuppressedRunIds: string[];
  activeStepId?: string;
  activeToolCallId?: string;
  activeSourceId?: string;
  lastSeq?: number;
};
```

Reducer 按 eventId/seq 幂等，组件不解释 raw events。`OPEN_WORKBENCH`、`CLOSE_WORKBENCH` 和 `FOCUS_WORKBENCH_TARGET` 是本地 UI action；projection event 只更新资源，不擅自覆盖用户当前 selection。被选资源消失或失效时按 Recovery 规则降级。

## 15. Responsive Layout

Desktop：Workbench 打开时 Conversation + Workspace 并列，Session navigation 独立窄栏；无可展示资源或用户主动收起时 Conversation 使用完整主区。

Tablet：Conversation/Workspace 可调比例或 tab。

Mobile：Conversation、Activity、Sources、Report 作为顶层 view 切换；从 Conversation 触发导航时切换到对应 Workbench view，Composer 不被 Workspace 覆盖。

Mobile 顶层 view 属 P8，不进入 P3 fixture 交互切片；P3 不应为了桌面端实现提前修改 mobile 行为。

固定/约束：

- tab bar 高度
- Activity summary header 高度
- source card action area
- Report viewport min/max size
- citation focus scroll offset

### Motion

桌面动效采用克制舒缓节奏：

- Workbench 打开时 Conversation 平滑收窄，Workbench 从右侧轻微滑入并淡入；关闭时反向执行。
- 主要过渡时长为 180–240ms，位移控制在 6–12px。
- Activity/Sources/Report tab 内容轻微淡入上移。
- execution detail 切换、logical tool call 新增和状态颜色变化使用短过渡。
- Conversation 内联 Tool Activity 的插入和状态变化使用短过渡，不改变内容顺序。
- 不使用弹跳、缩放、持续脉冲或大范围视差；running spinner 除外。
- `prefers-reduced-motion: reduce` 时关闭非必要动画并将过渡缩短到近即时。

P3 只实现桌面 Workbench 动效，不改变 mobile Workbench 交互。

## 16. Accessibility

- tabs 使用正确 ARIA semantics。
- citation link 可键盘操作。
- Conversation 中的 Tool Activity 可通过 Enter/Space 打开对应 Activity execution。
- progress 不只依赖颜色。
- running/cancelled/limited 有文字状态。
- source passage 支持复制但不自动执行链接内容。
- focus 在打开 Activity/Source/Report 时可预测移动；聚焦具体 execution 时目标标题具有可编程 focus。

## 17. Debug

Debug 默认关闭，仅开发配置启用：

- raw stream events
- StateRecord summaries
- refs
- context/tool/report traces

必须脱敏，不能展示 API Key、Authorization、完整 system prompt 或无限 provider payload。

## 18. Capability Evolution

P9/P10 实现后才增加 Memory management surface。

P11 实现后才增加 Worker progress；worker 仍不是用户可编辑执行图。

Browser/Terminal/Files 只有新产品需求和真实后端 capability 同时存在时才设计。

## 19. R1 验收

1. 用户一眼看出 Agent 正在做什么。
2. Clue 和 Evidence 不会混淆。
3. 报告 `[Sx]` 能定位 cited passage。
4. Draft 不冒充 final。
5. standard/limited/failed/cancelled 状态准确。
6. refresh/replay 恢复同一 Workspace。
7. Desktop/mobile 无重叠、溢出或不可达控件。
8. raw internal data 只在 Debug。
9. 未实现 capability 没有空 tab。
10. 点击 Conversation 内联 Tool Activity 能打开 Workbench 并定位正确 run/step/tool call。
11. 多次 tool call、terminal run、snapshot recovery 和 mobile view 切换不会定位到错误 execution。
