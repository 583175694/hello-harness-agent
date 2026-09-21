import type {
  AssistantContentBlock,
  AssistantToolActivityBlock,
  InterruptSnapshot,
  PlanSnapshot,
  PendingUserInputView,
  ArtifactRef,
  FileRef,
} from '@harness/agent-protocol';

import { AGENT_UI_COPY } from '../config/ui.constants';
import type {
  ActivityStatus,
  AgentUiState,
  PreviewState,
  SourceView,
  ToolCallStatus,
  ToolCallView,
} from '../model/types';

function fetchOutputSummary(running: boolean, failed: boolean): string | undefined {
  if (failed) return '成功 0 个，失败 2 个，提取 0 段原文';
  if (running) return undefined;
  return '成功 1 个，失败 1 个，提取 1 段原文';
}

function fetchSourceCount(running: boolean, failed: boolean): number | undefined {
  if (running) return undefined;
  if (failed) return 0;
  return 1;
}

function fetchSubtitle(running: boolean, failed: boolean): string {
  if (running) return '正在读取 2 个网页';
  if (failed) return '2 个来源读取失败';
  return '1 个已读来源';
}

function previewToolStatus(status: ActivityStatus): ToolCallStatus {
  if (
    status === 'cancelling' ||
    status === 'pause_requested' ||
    status === 'paused' ||
    status === 'resuming'
  ) {
    return 'running';
  }
  if (status === 'queued' || status === 'final_answer') return 'pending';
  if (status === 'waiting' || status === 'waiting_for_user') return 'waiting';
  return status;
}

function previewWorkbenchView(
  reportState: boolean,
  state: PreviewState,
): 'report' | 'sources' | 'activity' {
  if (reportState) return 'report';
  if (state === 'sources') return 'sources';
  return 'activity';
}

// 开发预览数据与生产状态完全隔离，避免 Mock 逻辑进入 API 流程。
export const PREVIEW_STATES: Array<{ id: PreviewState; label: string }> = [
  { id: 'empty', label: '空会话' },
  { id: 'direct-answer', label: '直接回答' },
  { id: 'tool-running', label: '检索中（已收起）' },
  { id: 'tool-running-open', label: '首次调用自动打开' },
  { id: 'plan-running', label: 'Plan 执行中' },
  { id: 'plan-completed', label: 'Plan 已完成' },
  { id: 'reasoning', label: '模型推理' },
  { id: 'artifacts', label: '生成文件' },
  { id: 'attachments', label: '文件附件' },
  { id: 'context-compacted', label: 'Context 已压缩' },
  { id: 'sources', label: '来源视图' },
  { id: 'fetch-running', label: '读取网页中' },
  { id: 'fetch-candidate', label: '已读网页' },
  { id: 'fetch-failed', label: '读取全部失败' },
  { id: 'waiting', label: '等待确认' },
  { id: 'clarification', label: '澄清问题' },
  { id: 'tool-approval', label: '工具审批' },
  { id: 'queued', label: '排队中' },
  { id: 'pause-requested', label: '即将暂停' },
  { id: 'paused', label: '已暂停' },
  { id: 'resuming', label: '恢复中' },
  { id: 'final-answer', label: '撰写回答' },
  { id: 'cancel-requested', label: '取消请求中' },
  { id: 'follow-up-pending', label: 'Follow-up 排队' },
  { id: 'steer-pending', label: 'Steer 待应用' },
  { id: 'steer-accepted', label: '已接受调整' },
  { id: 'cancelling', label: '取消中' },
  { id: 'cancelled', label: '已取消' },
  { id: 'failed', label: '执行失败' },
  { id: 'limited-report', label: '受限报告' },
  { id: 'final-report', label: '最终报告' },
];

// 仅供开发 fixture 使用的来源数据，生产 Sources 来自真实工具事件。
export const sources: SourceView[] = [
  {
    id: 'S1',
    title: 'Global AI Index 2025',
    domain: 'tortoisemedia.com',
    url: 'https://www.tortoisemedia.com/intelligence/global-ai/',
    excerpt:
      'The United States remains the leading country for private AI investment and model development.',
    time: '刚刚',
    kind: 'fetched',
    used: true,
  },
  {
    id: 'S2',
    title: 'China AI Development Report',
    domain: 'cset.georgetown.edu',
    url: 'https://cset.georgetown.edu/publication/china-ai-development-report/',
    excerpt:
      'China has continued to expand its AI research capacity, talent base, and industrial adoption.',
    time: '1 分钟前',
    kind: 'fetched',
    used: true,
  },
  {
    id: 'S3',
    title: 'Stanford AI Index Report',
    domain: 'hai.stanford.edu',
    url: 'https://hai.stanford.edu/ai-index',
    excerpt:
      'AI capability and adoption continue to grow while inference costs decline across leading models.',
    time: '2 分钟前',
    kind: 'fetched',
    used: true,
  },
  {
    id: 'S4',
    title: 'OECD AI Policy Observatory',
    domain: 'oecd.ai',
    url: 'https://oecd.ai/en/',
    excerpt:
      'Policy approaches increasingly focus on transparency, safety, and measurable economic impact.',
    time: '3 分钟前',
    kind: 'fetched',
    used: true,
  },
];

// 创建用于 Fetch 预览的可定位已读网页。
function makeFetchCandidate(): SourceView {
  const text = '企业正在把生成式 AI 从概念验证推进到客服、研发和知识管理等生产场景。';
  return {
    id: 'F1',
    title: '生成式 AI 产业应用观察',
    domain: 'example.com',
    url: 'https://example.com/ai-adoption',
    excerpt: text,
    time: '2026/8/8 10:30:00',
    kind: 'fetched',
    used: false,
    author: '研究团队',
    publishedAt: '2026-07-28',
    contentType: 'text/html',
    cacheStatus: 'miss',
    passages: [
      {
        passageId: 'preview-passage-1',
        text,
        locator: {
          kind: 'web_text',
          quote: { exact: text, prefix: '## 产业落地\n\n', suffix: '\n\n企业仍需关注数据治理。' },
          position: { start: 9, end: 9 + Array.from(text).length },
          sectionPath: ['产业落地'],
        },
      },
    ],
  };
}

// 创建 Search -> Fetch 的开发预览，不接入任何生产 API。
function makeFetchFixture(
  state: 'fetch-running' | 'fetch-candidate' | 'fetch-failed',
): AgentUiState {
  const runId = 'run-fetch-preview';
  const running = state === 'fetch-running';
  const failed = state === 'fetch-failed';
  const toolStatus = running ? ('running' as const) : ('completed' as const);
  const fetchTool: ToolCallView = {
    toolCallId: 'fetch-call-1',
    runId,
    stepId: 'fetch-call-1',
    toolName: 'web_fetch',
    title: '读取 2 个网页',
    detail: running ? '正在读取和过滤网页正文' : '网页原文读取已完成',
    status: toolStatus,
    elapsed: running ? '进行中' : '2.4 秒',
    inputSummary: '2 个网页 · 生成式 AI 产业落地证据',
    outputSummary: fetchOutputSummary(running, failed),
    resultCount: running ? undefined : 2,
    sourceCount: fetchSourceCount(running, failed),
  };
  const toolBlock: AssistantContentBlock = {
    id: 'fetch-block-1',
    type: 'tool_activity',
    toolCallId: 'fetch-call-1',
    toolName: 'web_fetch',
    status: toolStatus,
    title: '读取网页',
    summary: running ? '读取 2 个网页' : fetchTool.outputSummary,
    startedAt: '2026-08-08T02:29:58.000Z',
    ...(running ? {} : { completedAt: '2026-08-08T02:30:00.400Z', durationMs: 2_400 }),
  };
  const workbench = {
    runId,
    title: '网页证据读取',
    subtitle: fetchSubtitle(running, failed),
    activeView: state === 'fetch-candidate' ? ('sources' as const) : ('activity' as const),
    activityStatus: running ? ('running' as const) : ('completed' as const),
    executions: [fetchTool],
    focusTarget: {
      kind: 'tool_call' as const,
      runId,
      stepId: 'fetch-call-1',
      toolCallId: 'fetch-call-1',
    },
    followMode: 'auto' as const,
    sources: state === 'fetch-candidate' ? [makeFetchCandidate()] : [],
    open: state !== 'fetch-running',
  };
  return {
    label: '生成式 AI 产业调研',
    subtitle: '网页证据读取',
    conversation: [
      { id: 'fetch-user', kind: 'user', content: '请查找生成式 AI 产业落地的原始依据。' },
      { id: runId, kind: 'assistant', blocks: [toolBlock], pending: running, workbench },
    ],
    workbench,
  };
}

// 创建计划浮标的开发预览；空计划与完成计划都会隐藏浮标，因此只保留完成态。
function makePlanFixture(state: 'plan-running' | 'plan-completed'): AgentUiState {
  const runId = `run-${state}-preview`;
  const plan: PlanSnapshot = {
    explanation: '按资料收集、分析和交付三个阶段推进任务。',
    plan:
      state === 'plan-completed'
        ? [
            { step: '收集并核实关键资料', status: 'completed' },
            { step: '分析资料并整理结论', status: 'completed' },
            { step: '输出最终结果', status: 'completed' },
          ]
        : [
            { step: '收集并核实关键资料', status: 'in_progress' },
            { step: '分析资料并整理结论', status: 'pending' },
            { step: '输出最终结果', status: 'pending' },
          ],
  };
  const running = state !== 'plan-completed';
  const workbench = {
    ...makeWorkbench('tool-running-open', runId),
    title: 'Plan and Execute 预览',
    subtitle: running ? '正在按计划执行' : '计划已完成',
    activityStatus: running ? ('running' as const) : ('completed' as const),
    controlPhase: running ? ('tool_loop' as const) : ('terminal' as const),
    plan,
    open: true,
  };
  return {
    label: 'Plan and Execute',
    subtitle: '计划浮标状态预览',
    conversation: [
      { id: 'plan-user', kind: 'user', content: '请按计划完成一次多步骤资料整理。' },
      {
        id: runId,
        kind: 'assistant',
        blocks: [
          text(
            `${runId}-text-1`,
            running ? '我正在按计划收集资料并整理结果。' : '计划步骤已全部完成，下面是最终结果。',
          ),
          activity(runId, running ? 'running' : 'completed'),
        ],
        pending: running,
        workbench,
      },
    ],
    workbench,
    activeRunId: running ? runId : undefined,
    previewSubmitting: running,
  };
}

// 用一个已完成的推理轮展示可折叠 reasoning，而不依赖流式事件。
function makeReasoningFixture(): AgentUiState {
  const runId = 'run-reasoning-preview';
  return {
    label: '模型推理预览',
    subtitle: 'Reasoning 内容块',
    conversation: [
      { id: 'reasoning-user', kind: 'user', content: '比较两种方案，并说明最终建议。' },
      {
        id: runId,
        kind: 'assistant',
        deliveryStatus: 'completed',
        blocks: [
          {
            id: 'reasoning-block-1',
            type: 'reasoning',
            roundId: 'reasoning-round-1',
            roundSequence: 1,
            blockSequence: 0,
            content:
              '先比较交付速度、维护成本与扩展空间。方案 A 上线更快，但方案 B 的长期维护成本更低，且更适合后续增加数据源。',
            startedAt: '2026-09-16T02:00:00.000Z',
            completedAt: '2026-09-16T02:00:08.000Z',
            durationMs: 8_000,
          },
          {
            id: 'reasoning-final-1',
            type: 'text',
            phase: 'final',
            content: '建议选择方案 B：初期投入略高，但维护成本和扩展风险更可控。',
          },
        ],
      },
    ],
  };
}

const previewArtifacts: ArtifactRef[] = [
  {
    artifactId: 'artifact-report-preview',
    fileId: 'file-report-preview',
    fileName: '市场调研报告.pdf',
    mediaType: 'application/pdf',
    fileKind: 'pdf',
    size: 284_320,
    status: 'ready',
    createdAt: '2026-09-16T02:10:00.000Z',
  },
  {
    artifactId: 'artifact-data-preview',
    fileId: 'file-data-preview',
    fileName: '市场数据.xlsx',
    mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileKind: 'xlsx',
    size: 96_512,
    status: 'ready',
    createdAt: '2026-09-16T02:10:01.000Z',
  },
  {
    artifactId: 'artifact-doc-preview',
    fileId: 'file-doc-preview',
    fileName: '执行摘要.docx',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileKind: 'docx',
    size: 51_204,
    status: 'ready',
    createdAt: '2026-09-16T02:10:02.000Z',
  },
];

// 组合展示多格式 Artifact 的 Conversation 卡片和 Workbench 列表。
function makeArtifactFixture(): AgentUiState {
  const runId = 'run-artifact-preview';
  const blocks: AssistantContentBlock[] = [
    text('artifact-final-text', '报告、数据表和执行摘要已经生成，可分别预览或下载。'),
    ...previewArtifacts.map((artifact, index) => ({
      id: `artifact-block-${index + 1}`,
      type: 'artifact' as const,
      ...artifact,
    })),
  ];
  const workbench = {
    runId,
    title: '交付文件',
    subtitle: `${previewArtifacts.length} 个文件已就绪`,
    activeView: 'artifact' as const,
    activityStatus: 'completed' as const,
    controlPhase: 'terminal' as const,
    executions: [],
    followMode: 'auto' as const,
    sources: [],
    artifacts: previewArtifacts,
    open: true,
  };
  return {
    label: '多格式交付物',
    subtitle: 'PDF、XLSX 与 DOCX',
    conversation: [
      { id: 'artifact-user', kind: 'user', content: '请生成报告、数据表和执行摘要。' },
      { id: runId, kind: 'assistant', deliveryStatus: 'completed', blocks, workbench },
    ],
    workbench,
  };
}

const previewAttachments: FileRef[] = [
  {
    fileId: 'attachment-image-preview',
    fileName: '产品草图.png',
    mediaType: 'image/png',
    fileKind: 'image',
    size: 184_320,
    width: 960,
    height: 640,
    status: 'ready',
    previewUrl:
      'data:image/svg+xml;charset=utf-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="960" height="640"%3E%3Crect width="960" height="640" fill="%23e8eef5"/%3E%3Crect x="100" y="90" width="760" height="460" rx="24" fill="%23ffffff" stroke="%2394a3b8" stroke-width="4"/%3E%3Ctext x="480" y="330" text-anchor="middle" font-family="sans-serif" font-size="42" fill="%23475569"%3E产品草图%3C/text%3E%3C/svg%3E',
  },
  {
    fileId: 'attachment-document-preview',
    fileName: '需求说明.pdf',
    mediaType: 'application/pdf',
    fileKind: 'pdf',
    size: 428_032,
    pageCount: 12,
    status: 'ready',
  },
];

// 历史用户消息直接携带附件，覆盖图片缩略图和文档卡片两种展示。
function makeAttachmentFixture(): AgentUiState {
  return {
    label: '附件消息',
    subtitle: '图片与文档',
    conversation: [
      {
        id: 'attachment-user',
        kind: 'user',
        content: '请结合草图和需求说明给出实现建议。',
        attachments: previewAttachments,
      },
      {
        id: 'attachment-answer',
        kind: 'assistant',
        deliveryStatus: 'completed',
        blocks: [text('attachment-answer-text', '已读取图片和 PDF，建议先统一信息层级，再补充交互状态说明。')],
      },
    ],
  };
}

// 展示触发压缩后的 Context 预算提示和可检查的 Context 工作区。
function makeContextFixture(): AgentUiState {
  const context = {
    version: 1 as const,
    roundSequence: 6,
    attempt: 1,
    estimatedInputTokens: 508_400,
    promptBudget: 566_000,
    compactionTriggered: true,
    finalResponseOnly: false,
    messages: [],
    tools: [],
  };
  const workbench = {
    runId: 'run-context-preview',
    title: 'Context 调试',
    subtitle: 'Model Round 6',
    activeView: 'context' as const,
    activityStatus: 'running' as const,
    controlPhase: 'tool_loop' as const,
    executions: [],
    followMode: 'auto' as const,
    sources: [],
    context,
    open: true,
  };
  return {
    label: '长会话 Context',
    subtitle: '已触发上下文压缩',
    conversation: [
      { id: 'context-user', kind: 'user', content: '继续基于前面的长对话完成分析。' },
      {
        id: 'run-context-preview',
        kind: 'assistant',
        pending: true,
        blocks: [text('context-process', '已压缩较早的对话内容，正在继续处理当前任务。')],
        workbench,
      },
    ],
    workbench,
    context,
    activeRunId: 'run-context-preview',
    previewSubmitting: true,
  };
}

// 为开发预览状态构造确定性的工具调用列表。
export function makeToolCalls(
  runId: string,
  status: ActivityStatus,
  sourceCount: number,
): ToolCallView[] {
  const currentStatus = previewToolStatus(status);
  return [
    {
      toolCallId: `${runId}-tool-1`,
      runId,
      stepId: `${runId}-tool-1`,
      toolName: 'web_search',
      title: '检索市场趋势',
      detail: '查找中国生成式 AI 市场的近期概览',
      status: 'completed',
      elapsed: '31 秒',
      inputSummary: '中国生成式 AI 市场趋势 2025',
      outputSummary: '返回 12 条结果，保留 4 条候选来源',
      resultCount: 12,
      sourceCount: 4,
    },
    {
      toolCallId: `${runId}-tool-2`,
      runId,
      stepId: `${runId}-tool-2`,
      toolName: 'web_search',
      title: '检索产业落地案例',
      detail: '聚焦制造业、消费互联网和政企应用',
      status: 'completed',
      elapsed: '38 秒',
      inputSummary: '中国生成式 AI 产业应用 制造业 政企',
      outputSummary: '返回 9 条结果，提取 3 个案例',
      resultCount: 9,
      sourceCount: 3,
    },
    {
      toolCallId: `${runId}-tool-3`,
      runId,
      stepId: `${runId}-tool-3`,
      toolName: 'web_search',
      title: status === 'waiting' ? '确认检索时间范围' : '交叉验证关键结论',
      detail:
        status === 'waiting'
          ? '时间范围不明确，等待用户确认后继续'
          : '验证市场规模、增速与产业应用结论',
      status: currentStatus,
      elapsed: status === 'completed' ? '44 秒' : '进行中',
      inputSummary: '中国生成式 AI 市场规模 增速 产业落地',
      outputSummary:
        status === 'completed' ? `完成交叉验证，确认 ${sourceCount} 个可用来源` : undefined,
      resultCount: status === 'completed' ? 8 : undefined,
      sourceCount: status === 'completed' ? sourceCount : undefined,
    },
  ];
}

// 创建用于展示穿插顺序的文本块。
function text(id: string, content: string): AssistantContentBlock {
  return { id, type: 'text', content };
}

// 创建与工具调用稳定对应的 Activity 内容块。
function activity(
  runId: string,
  status: AssistantToolActivityBlock['status'],
): AssistantContentBlock {
  const summaries = {
    running: '中国生成式 AI 市场规模 增速 产业落地',
    completed: '找到 8 个结果',
    failed: '搜索供应商暂时不可用（503）',
    cancelled: '已停止当前搜索请求',
  } as const;
  return {
    id: `${runId}-activity-3`,
    type: 'tool_activity',
    toolCallId: `${runId}-tool-3`,
    toolName: 'web_search',
    status,
    title: '搜索网页',
    summary: summaries[status],
    startedAt: '2026-08-07T09:00:00.000Z',
    ...(status === 'running'
      ? {}
      : { completedAt: '2026-08-07T09:00:44.000Z', durationMs: 44_000 }),
  };
}

// 将预览状态映射为内联工具 Activity 的稳定状态。
function activityStatus(state: PreviewState): AssistantToolActivityBlock['status'] {
  if (state === 'failed') return 'failed';
  if (state === 'cancelled') return 'cancelled';
  if (state === 'final-report' || state === 'limited-report' || state === 'sources')
    return 'completed';
  return 'running';
}

function runtimeStatus(state: PreviewState): ActivityStatus {
  if (state === 'queued') return 'queued';
  if (state === 'final-answer') return 'final_answer';
  if (state === 'cancel-requested') return 'cancelling';
  if (state === 'clarification' || state === 'tool-approval') return 'waiting_for_user';
  if (state === 'waiting') return 'waiting';
  if (state === 'pause-requested') return 'pause_requested';
  if (state === 'paused') return 'paused';
  if (state === 'resuming') return 'resuming';
  if (state === 'cancelling') return 'cancelling';
  if (state === 'cancelled') return 'cancelled';
  if (state === 'failed') return 'failed';
  if (state === 'final-report' || state === 'limited-report') return 'completed';
  return 'running';
}

function makePendingInputs(state: PreviewState): PendingUserInputView[] | undefined {
  if (state === 'follow-up-pending')
    return [
      {
        id: 'preview-follow-up-1',
        kind: 'follow_up',
        status: 'pending',
        content: '再补充制造业案例。',
        sequence: 1,
      },
      {
        id: 'preview-follow-up-2',
        kind: 'follow_up',
        status: 'pending',
        content: '同时比较中美市场增速。',
        sequence: 2,
      },
    ];
  if (state === 'steer-pending')
    return [
      {
        id: 'preview-steer-1',
        kind: 'steer',
        status: 'pending',
        content: '优先关注产业应用案例。',
        sequence: 1,
      },
    ];
  return undefined;
}

function makeInterrupt(state: PreviewState, runId: string): InterruptSnapshot | undefined {
  const createdAt = '2026-08-24T03:00:00.000Z';
  if (state === 'clarification')
    return {
      interruptId: 'preview-clarification',
      runId,
      kind: 'clarification',
      status: 'pending',
      createdAt,
      roundId: 'preview-round-1',
      roundSequence: 1,
      payload: {
        question: '你希望重点关注近 12 个月还是近 3 年？',
        options: ['近 12 个月', '近 3 年'],
        allowFreeText: true,
      },
    };
  if (state === 'tool-approval')
    return {
      interruptId: 'preview-approval',
      runId,
      kind: 'tool_approval',
      status: 'pending',
      createdAt,
      roundId: 'preview-round-1',
      roundSequence: 1,
      payload: {
        items: [
          {
            itemId: 'preview-approval-item',
            toolCallId: `${runId}-tool-3`,
            toolName: 'approval_test',
            input: { message: '模拟需要确认的工具调用' },
            argumentsHash: 'preview-hash',
          },
        ],
      },
    };
  return undefined;
}

// 为不同预览状态创建统一 Workbench 外壳数据。
function makeWorkbench(state: PreviewState, runId: string) {
  const status = activityStatus(state);
  const executionStatus = runtimeStatus(state);
  const executions = makeToolCalls(runId, executionStatus, sources.length);
  const reportState = state === 'final-report' || state === 'limited-report';
  const open = state !== 'tool-running';
  return {
    runId,
    title: reportState ? '中国与美国 AI 市场' : '中国 AI 市场调研',
    subtitle: status === 'running' ? '网页检索 · 正在执行' : `网页检索 · ${sources.length} 个来源`,
    activeView: previewWorkbenchView(reportState, state),
    activityStatus: executionStatus,
    controlPhase: state === 'final-answer' ? ('final_answer' as const) : ('tool_loop' as const),
    executions,
    focusTarget: {
      kind: 'tool_call' as const,
      runId,
      stepId: `${runId}-tool-3`,
      toolCallId: `${runId}-tool-3`,
    },
    followMode: 'auto' as const,
    sources: state === 'failed' ? sources.slice(0, 1) : sources,
    ...(reportState
      ? {
          report: {
            title: state === 'limited-report' ? '受限报告：证据缺口' : '中国与美国 AI 市场对比',
            updated: '刚刚更新',
            content: (
              <>
                <p>美国在前沿模型训练、私人投资和高端算力方面仍然领先 [S1][S3]。</p>
                <p>中国的优势更多体现在制造业、消费互联网和政企场景的规模化应用 [S2]。</p>
                {state === 'limited-report' ? (
                  <p className="report-warning">部分数字缺少可定位原文，暂不作为已确认结论。</p>
                ) : null}
              </>
            ),
          },
        }
      : {}),
    open,
  };
}

// 为开发预览地址生成隔离的有序内容块 UI 数据。
export function makeFixture(state: PreviewState): AgentUiState {
  if (state === 'empty')
    return { label: AGENT_UI_COPY.defaultSessionTitle, subtitle: '', conversation: [] };
  if (state === 'direct-answer')
    return {
      label: 'AI 趋势概览',
      subtitle: '',
      conversation: [
        { id: 'u1', kind: 'user', content: '什么是生成式 AI？' },
        {
          id: 'a1',
          kind: 'assistant',
          blocks: [
            text(
              'a1-text-1',
              `# Markdown 组件检查

这是一段普通文本，包含**粗体**、*斜体*、***粗斜体***、~~删除线~~、\`行内代码\`，以及 [外部链接](https://example.com)。

![占位图片](https://placehold.co/640x180/e8eef5/475569?text=Markdown+Image "图片标题")

> 生成结果仍然需要人工复核。
>
> 支持多段引用与换行。

## 标题层级

### 三级标题

#### 四级标题

##### 五级标题

###### 六级标题

## 列表与任务

- 明确目标
  - 补充必要上下文
  - 说明输出格式
- 检查结果

1. 编写提示词
   1. 给出约束
   2. 提供示例
2. 复核输出

- [x] 明确目标
- [ ] 人工复核

## 表格与代码

| 能力 | 示例 | 覆盖 |
| :--- | :---: | ---: |
| 文本 | 摘要与问答 | ✅ |
| 代码 | 生成与解释 | ✅ |

\`\`\`ts
const answer = 'Hello, Markdown';
console.log(answer);
\`\`\`

未标注语言的代码块也会保留：

\`\`\`
plain text
\`\`\`

## 数学与流程图

行内公式 $E = mc^2$，块级公式：

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

\`\`\`mermaid
flowchart LR
  A[输入] --> B{校验}
  B -->|通过| C[生成回答]
  B -->|失败| D[提示修正]
\`\`\`

---

以上组件应在浅色和深色主题下保持清晰。`,
            ),
          ],
        },
      ],
      context: {
        version: 1,
        roundSequence: 1,
        attempt: 1,
        estimatedInputTokens: 24_680,
        promptBudget: 566_000,
        compactionTriggered: false,
        finalResponseOnly: false,
        messages: [],
        tools: [],
      },
    };
  if (state === 'fetch-running' || state === 'fetch-candidate' || state === 'fetch-failed') {
    return makeFetchFixture(state);
  }
  if (state === 'plan-running' || state === 'plan-completed') {
    return makePlanFixture(state);
  }

  if (state === 'reasoning') return makeReasoningFixture();
  if (state === 'artifacts') return makeArtifactFixture();
  if (state === 'attachments') return makeAttachmentFixture();
  if (state === 'context-compacted') return makeContextFixture();

  const runId =
    state === 'final-report' || state === 'limited-report'
      ? 'run-market-report'
      : 'run-market-live';
  const blocks: AssistantContentBlock[] = [
    text(`${runId}-text-1`, '我先检索近期公开资料，再结合来源给出结论。'),
    activity(runId, activityStatus(state)),
  ];
  if (state === 'sources')
    blocks.push(text(`${runId}-text-2`, '已获得第一批结果，正在交叉验证关键结论。'));
  if (state === 'waiting' || state === 'clarification' || state === 'tool-approval')
    blocks.push(text(`${runId}-text-2`, '检索材料跨度较大，请确认关注近 12 个月还是近 3 年。'));
  if (state === 'queued') blocks.push(text(`${runId}-text-2`, '任务已提交，正在等待执行资源。'));
  if (state === 'pause-requested')
    blocks.push(text(`${runId}-text-2`, '已收到暂停请求，将在当前安全边界暂停。'));
  if (state === 'paused')
    blocks.push(text(`${runId}-text-2`, '任务已暂停，可从同一个运行边界继续。'));
  if (state === 'resuming') blocks.push(text(`${runId}-text-2`, '正在从暂停边界恢复任务。'));
  if (state === 'final-answer')
    blocks.push(text(`${runId}-text-2`, '证据已整理完成，正在撰写最终回答。'));
  if (state === 'cancel-requested')
    blocks.push(text(`${runId}-text-2`, '已收到取消请求，正在安全停止。'));
  if (state === 'follow-up-pending')
    blocks.push(text(`${runId}-text-2`, '当前任务继续执行，后续消息会在完成后按顺序启动。'));
  if (state === 'steer-pending')
    blocks.push(text(`${runId}-text-2`, '方向调整已进入队列，将在下一安全步骤应用。'));
  if (state === 'steer-accepted') {
    blocks.push({
      id: `${runId}-intervention-1`,
      type: 'user_intervention',
      roundId: 'preview-round-2',
      roundSequence: 2,
      blockSequence: 0,
      inputId: 'preview-steer-applied-1',
      content: '优先关注产业应用案例。',
    });
    blocks.push(
      text(`${runId}-text-2`, '已接受调整，接下来会重点补充中国市场的产业应用案例。'),
    );
  }
  if (state === 'cancelling') blocks.push(text(`${runId}-text-2`, '正在安全停止当前检索。'));
  if (state === 'cancelled')
    blocks.push(text(`${runId}-text-2`, '任务已取消，取消前的来源快照仍保留在工作台中。'));
  if (state === 'failed')
    blocks.push(text(`${runId}-text-2`, '搜索供应商暂时不可用，当前回答未能完成。'));
  if (state === 'final-report' || state === 'limited-report')
    blocks.push(
      text(
        `${runId}-text-2`,
        '检索和复核已经完成。美国在前沿模型和私人投资方面领先 [S1][S3]；中国在产业落地方面具备优势 [S2][S4]。',
      ),
    );
  const workbench = makeWorkbench(state, runId);
  const interrupt = makeInterrupt(state, runId);
  return {
    label: state === 'limited-report' ? '受限报告' : '中国 AI 市场调研',
    subtitle: '网页检索任务',
    conversation: [
      { id: 'u1', kind: 'user', content: '请调研中国生成式 AI 市场趋势，重点关注产业落地。' },
      {
        id: runId,
        kind: 'assistant',
        blocks,
        pending: !['final-report', 'limited-report', 'cancelled', 'failed'].includes(state),
        workbench,
      },
    ],
    workbench,
    activeRunId: !['final-report', 'limited-report', 'cancelled', 'failed'].includes(state)
      ? runId
      : undefined,
    activeInterrupt: interrupt,
    pendingInputs: makePendingInputs(state),
    previewSubmitting: [
      'queued',
      'pause-requested',
      'paused',
      'resuming',
      'clarification',
      'tool-approval',
      'final-answer',
      'cancel-requested',
      'follow-up-pending',
      'steer-pending',
      'cancelling',
    ].includes(state),
    autoOpenSuppressedRunIds: state === 'tool-running' ? [runId] : [],
  };
}
