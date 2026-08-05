import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleUserRound,
  Copy,
  Clock3,
  FileText,
  Globe2,
  Ellipsis,
  LoaderCircle,
  Menu,
  PanelRight,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import {
  ApiProblem,
  createSession,
  deleteSession,
  generateSessionTitle,
  getReadiness,
  getSession,
  listSessions,
  requestChatStream,
  updateSession,
} from './api/client';
import type { ToolStreamEvent } from './api/client';
import { MarkdownContent } from './components/markdown-content';
import { assistantAgentMetadataSchema } from '@harness/agent-protocol';
import type { PersistedMessage, SessionSummary } from '@harness/agent-protocol';

type ServiceState = 'checking' | 'ready' | 'unavailable';
type PreviewState =
  | 'empty'
  | 'direct-answer'
  | 'tool-running'
  | 'tool-running-open'
  | 'sources'
  | 'final-report'
  | 'waiting'
  | 'steer-accepted'
  | 'cancelling'
  | 'cancelled'
  | 'limited-report'
  | 'failed';
type WorkspaceView = 'activity' | 'sources' | 'report';
type ActivityStatus = 'running' | 'completed' | 'waiting' | 'cancelling' | 'cancelled' | 'failed';
type ToolCallStatus =
  'pending' | 'running' | 'waiting' | 'cancelling' | 'completed' | 'failed' | 'cancelled';
type ProgressStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type WorkbenchFocusTarget =
  | { kind: 'activity'; runId: string; stepId?: string }
  | { kind: 'tool_call'; runId: string; stepId: string; toolCallId: string }
  | { kind: 'source'; runId: string; sourceId: string }
  | { kind: 'report'; runId: string };

const PREVIEW_STATES: Array<{ id: PreviewState; label: string }> = [
  { id: 'empty', label: '空会话' },
  { id: 'direct-answer', label: '直接回答' },
  { id: 'tool-running', label: '检索中（已收起）' },
  { id: 'tool-running-open', label: '首次调用自动打开' },
  { id: 'sources', label: '来源视图' },
  { id: 'waiting', label: '等待确认' },
  { id: 'steer-accepted', label: '已接受调整' },
  { id: 'cancelling', label: '取消中' },
  { id: 'cancelled', label: '已取消' },
  { id: 'failed', label: '执行失败' },
  { id: 'limited-report', label: '受限报告' },
  { id: 'final-report', label: '最终报告' },
];

export type ConversationItem =
  | { id: string; kind: 'user'; content: string; time?: string; createdAt?: string }
  | {
      id: string;
      kind: 'assistant';
      content: ReactNode;
      text?: string;
      time?: string;
      createdAt?: string;
      workbench?: WorkbenchState;
    }
  | { id: string; kind: 'run'; run: RunCardState };

export type RunCardState = {
  runId: string;
  status: ActivityStatus;
  stage: string;
  currentAction: string;
  elapsed: string;
  queryCount: number;
  sourceCount: number;
  summary?: string;
  progress: ProgressItemState[];
  toolCalls: ToolCallView[];
};

export type ProgressItemState = {
  id: string;
  label: string;
  status: ProgressStatus;
};

export type ToolCallView = {
  toolCallId: string;
  runId: string;
  stepId: string;
  toolName: string;
  title: string;
  detail: string;
  status: ToolCallStatus;
  elapsed: string;
  inputSummary: string;
  outputSummary?: string;
  resultCount?: number;
  sourceCount?: number;
};

export type SourceView = {
  id: string;
  title: string;
  domain: string;
  url: string;
  excerpt: string;
  time: string;
  provider?: string;
  kind?: 'clue' | 'evidence';
};

export type ReportView = {
  title: string;
  updated: string;
  content: ReactNode;
};

export type WorkbenchState = {
  runId: string;
  title: string;
  subtitle: string;
  activeView: WorkspaceView;
  activityStatus?: ActivityStatus;
  executions: ToolCallView[];
  focusTarget?: WorkbenchFocusTarget;
  followMode: 'auto' | 'pinned';
  sources: SourceView[];
  report?: ReportView;
  open: boolean;
};

export type AgentUiState = {
  label: string;
  subtitle: string;
  conversation: ConversationItem[];
  run?: RunCardState;
  workbench?: WorkbenchState;
  autoOpenSuppressedRunIds?: string[];
};

const sources: SourceView[] = [
  {
    id: 'S1',
    title: 'Global AI Index 2025',
    domain: 'tortoisemedia.com',
    url: 'https://www.tortoisemedia.com/intelligence/global-ai/',
    excerpt:
      'The United States remains the leading country for private AI investment and model development.',
    time: '刚刚',
  },
  {
    id: 'S2',
    title: 'China AI Development Report',
    domain: 'cset.georgetown.edu',
    url: 'https://cset.georgetown.edu/publication/china-ai-development-report/',
    excerpt:
      'China has continued to expand its AI research capacity, talent base, and industrial adoption.',
    time: '1 分钟前',
  },
  {
    id: 'S3',
    title: 'Stanford AI Index Report',
    domain: 'hai.stanford.edu',
    url: 'https://hai.stanford.edu/ai-index',
    excerpt:
      'AI capability and adoption continue to grow while inference costs decline across leading models.',
    time: '2 分钟前',
  },
  {
    id: 'S4',
    title: 'OECD AI Policy Observatory',
    domain: 'oecd.ai',
    url: 'https://oecd.ai/en/',
    excerpt:
      'Policy approaches increasingly focus on transparency, safety, and measurable economic impact.',
    time: '3 分钟前',
  },
];

// 将消息创建时间格式化为当前本地时间。
function formatMessageTime(createdAt?: string, fallback?: string): string {
  if (createdAt) {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(createdAt));
  }
  if (fallback && fallback !== '刚刚') return fallback;
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date());
}

// 提供仅在悬停或键盘聚焦时出现的消息复制操作。
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copyMessage() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      className="message-copy"
      type="button"
      aria-label={copied ? '已复制消息' : '复制消息'}
      title={copied ? '已复制' : '复制消息'}
      onClick={() => void copyMessage()}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

// 为开发预览状态构造确定性的工具调用列表。
function makeToolCalls(runId: string, status: ActivityStatus, sourceCount: number): ToolCallView[] {
  const currentStatus: ToolCallStatus = status;
  return [
    {
      toolCallId: `${runId}-tool-1`,
      runId,
      stepId: `${runId}-step-1`,
      toolName: 'web.search',
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
      stepId: `${runId}-step-2`,
      toolName: 'web.search',
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
      stepId: `${runId}-step-3`,
      toolName: 'web.search',
      title: status === 'waiting' ? '确认检索时间范围' : '交叉验证关键结论',
      detail:
        status === 'waiting'
          ? '时间范围不明确，等待用户确认后继续'
          : '验证市场规模、增速与产业应用结论',
      status: currentStatus,
      elapsed: status === 'completed' ? '44 秒' : '进行中',
      inputSummary: '中国生成式 AI 市场规模 增速 产业落地',
      outputSummary:
        status === 'completed'
          ? `完成交叉验证，确认 ${sourceCount} 个可用来源`
          : status === 'cancelled'
            ? '调用已取消，保留取消前结果'
            : status === 'cancelling'
              ? '正在停止当前搜索请求'
              : undefined,
      resultCount: status === 'completed' ? 8 : undefined,
      sourceCount: status === 'completed' ? sourceCount : undefined,
    },
  ];
}

// 将运行状态映射为 RunCard 使用的紧凑进度模型。
function makeProgress(status: ActivityStatus): ProgressItemState[] {
  const searchStatus: ProgressStatus =
    status === 'completed'
      ? 'completed'
      : status === 'failed'
        ? 'failed'
        : status === 'cancelled'
          ? 'cancelled'
          : 'running';
  return [
    { id: 'plan', label: '理解任务范围', status: 'completed' },
    { id: 'search', label: '搜索与提取证据', status: searchStatus },
    {
      id: 'report',
      label: '生成并复核报告',
      status: status === 'completed' ? 'completed' : 'pending',
    },
  ];
}

// 创建完整的预览运行数据，并允许按状态覆盖字段。
function buildRun(
  runId: string,
  status: ActivityStatus,
  overrides: Partial<RunCardState> = {},
): RunCardState {
  const defaults: Record<
    ActivityStatus,
    Pick<RunCardState, 'stage' | 'currentAction' | 'elapsed' | 'queryCount' | 'sourceCount'>
  > = {
    running: {
      stage: '检索中',
      currentAction: '正在交叉验证关键结论',
      elapsed: '1 分 24 秒',
      queryCount: 3,
      sourceCount: 4,
    },
    waiting: {
      stage: '等待确认',
      currentAction: '需要确认时间范围后继续',
      elapsed: '1 分 08 秒',
      queryCount: 2,
      sourceCount: 3,
    },
    cancelling: {
      stage: '正在取消',
      currentAction: '正在安全停止当前步骤',
      elapsed: '1 分 51 秒',
      queryCount: 3,
      sourceCount: 4,
    },
    cancelled: {
      stage: '已取消',
      currentAction: '任务已由用户取消',
      elapsed: '1 分 55 秒',
      queryCount: 3,
      sourceCount: 4,
    },
    failed: {
      stage: '执行失败',
      currentAction: '搜索供应商暂时不可用',
      elapsed: '52 秒',
      queryCount: 2,
      sourceCount: 1,
    },
    completed: {
      stage: '已完成',
      currentAction: '报告已生成并完成引用校验',
      elapsed: '3 分 42 秒',
      queryCount: 5,
      sourceCount: 8,
    },
  };
  const base = defaults[status];
  return {
    runId,
    status,
    ...base,
    summary:
      status === 'completed'
        ? '完成 5 次检索，引用 8 个来源，用时 3 分 42 秒'
        : status === 'cancelled'
          ? '已取消：完成 3 次检索，保留 4 个来源快照'
          : status === 'failed'
            ? '失败：搜索供应商返回 503'
            : undefined,
    progress: makeProgress(status),
    toolCalls: makeToolCalls(runId, status, base.sourceCount),
    ...overrides,
  };
}

const completedRun = buildRun('run-market-report', 'completed');

// 将传输和供应商异常转换为用户可读的提示文案。
function getErrorMessage(error: unknown): string {
  if (error instanceof ApiProblem) return error.problem.detail;
  if (error instanceof Error) return error.message;
  return '请求暂时无法完成。';
}

// 为开发预览地址生成隔离的 UI 数据。
function makeFixture(state: PreviewState): AgentUiState {
  const baseAnswer = (
    <>
      <p>这是一个直接回答示例。当前问题不需要调用外部工具，我会在对话中快速给出结论。</p>
      <p>如果你希望继续深入，可以直接说“请深度调研”，系统会在需要时展开检索过程。</p>
    </>
  );

  const runByState: Record<
    Exclude<PreviewState, 'empty' | 'direct-answer' | 'final-report' | 'limited-report'>,
    RunCardState
  > = {
    'tool-running': buildRun('run-market-live', 'running'),
    'tool-running-open': buildRun('run-market-live', 'running'),
    sources: buildRun('run-market-live', 'running', {
      currentAction: '已收集 4 个有效来源，继续交叉验证',
      elapsed: '1 分 48 秒',
      queryCount: 4,
    }),
    waiting: buildRun('run-market-live', 'waiting'),
    'steer-accepted': buildRun('run-market-live', 'running', {
      currentAction: '已接受调整，优先补充产业应用案例',
      elapsed: '1 分 36 秒',
      queryCount: 4,
    }),
    cancelling: buildRun('run-market-live', 'cancelling'),
    cancelled: buildRun('run-market-live', 'cancelled'),
    failed: buildRun('run-market-live', 'failed'),
  };

  if (state === 'empty') return { label: '新任务', subtitle: '', conversation: [] };
  if (state === 'direct-answer') {
    return {
      label: 'AI 趋势概览',
      subtitle: '',
      conversation: [
        { id: 'u1', kind: 'user', content: '什么是生成式 AI？' },
        { id: 'a1', kind: 'assistant', content: baseAnswer },
      ],
    };
  }
  if (state === 'final-report' || state === 'limited-report') {
    const limited = state === 'limited-report';
    return {
      label: limited ? '受限报告' : '中国 AI 市场调研',
      subtitle: '网页检索 · Markdown 文件',
      conversation: [
        { id: 'u1', kind: 'user', content: '请调研中国与美国 AI 市场的主要差异。' },
        {
          id: 'a1',
          kind: 'assistant',
          content: (
            <>
              <p>我已完成检索、证据整理和复核，下面是当前结论。</p>
              <p>
                美国在前沿模型和私人投资规模上保持领先
                [S1][S3]；中国在产业落地、应用规模和政策推动方面具备明显优势 [S2][S4]。
              </p>
            </>
          ),
        },
        { id: 'r1', kind: 'run', run: completedRun },
      ],
      run: completedRun,
      workbench: {
        runId: completedRun.runId,
        title: limited ? '受限报告' : '中国与美国 AI 市场',
        subtitle: limited ? '证据不足 · 需要进一步检索' : '最终报告 · 8 个引用来源',
        activeView: 'report',
        activityStatus: 'completed',
        executions: completedRun.toolCalls,
        focusTarget: { kind: 'report', runId: completedRun.runId },
        followMode: 'pinned',
        sources,
        report: {
          title: limited ? '受限报告：证据缺口' : '中国与美国 AI 市场对比',
          updated: '刚刚更新',
          content: (
            <>
              <p>美国在前沿模型训练、私人投资和高端算力方面仍然占据领先位置 [S1][S3]。</p>
              <p>中国的优势更多体现在制造业、消费互联网和政企场景的规模化应用 [S2]。</p>
              {limited ? (
                <p className="report-warning">
                  部分关于市场规模和增速的数字缺少可定位原文，暂不作为已确认结论。
                </p>
              ) : (
                <p>以上结论已通过确定性引用校验，完整来源列表见下方。</p>
              )}
            </>
          ),
        },
        open: true,
      },
    };
  }

  const run = runByState[state];
  const openWorkbench =
    state === 'tool-running-open' ||
    state === 'sources' ||
    state === 'steer-accepted' ||
    state === 'cancelling' ||
    state === 'cancelled' ||
    state === 'failed' ||
    state === 'waiting';

  const workbenchSubtitle: Record<string, string> = {
    'tool-running-open': '网页检索 · 正在执行',
    sources: '网页检索 · 4 个来源',
    waiting: '等待确认 · 时间范围',
    'steer-accepted': '网页检索 · 已调整焦点',
    cancelling: '正在安全取消',
    cancelled: '任务已取消 · 保留快照',
    failed: '执行失败 · 供应商不可用',
  };

  return {
    label: '中国 AI 市场调研',
    subtitle: '网页检索任务',
    conversation: [
      { id: 'u1', kind: 'user', content: '请调研中国生成式 AI 市场趋势，重点关注产业落地。' },
      { id: 'r1', kind: 'run', run },
      ...(state === 'steer-accepted'
        ? [
            {
              id: 'a1',
              kind: 'assistant' as const,
              content: <p>已接受调整：接下来会重点分析中国市场，并优先补充产业应用案例。</p>,
            },
          ]
        : []),
      ...(state === 'waiting'
        ? [
            {
              id: 'a1',
              kind: 'assistant' as const,
              content: (
                <p>
                  检索到的材料覆盖范围较广。请确认时间范围是「近 12 个月」还是「近 3
                  年」，我会据此继续筛选证据。
                </p>
              ),
            },
          ]
        : []),
      ...(state === 'failed'
        ? [
            {
              id: 'a1',
              kind: 'assistant' as const,
              content: (
                <p>
                  搜索供应商暂时不可用（503）。已保留当前快照，你可以稍后重试，或改用本地已有材料继续。
                </p>
              ),
            },
          ]
        : []),
      ...(state === 'cancelled'
        ? [
            {
              id: 'a1',
              kind: 'assistant' as const,
              content: (
                <p>任务已取消。工作台中仍保留取消前收集到的来源快照，便于你继续或重新发起。</p>
              ),
            },
          ]
        : []),
    ],
    run,
    workbench: {
      runId: run.runId,
      title: '中国 AI 市场调研',
      subtitle: workbenchSubtitle[state] ?? '网页检索 · 4 个来源',
      activeView: state === 'sources' ? 'sources' : 'activity',
      activityStatus: run.status,
      executions: run.toolCalls,
      focusTarget: {
        kind: 'tool_call',
        runId: run.runId,
        stepId: run.toolCalls.at(-1)!.stepId,
        toolCallId: run.toolCalls.at(-1)!.toolCallId,
      },
      followMode: 'auto',
      sources: state === 'failed' ? sources.slice(0, 1) : sources,
      open: openWorkbench,
    },
    autoOpenSuppressedRunIds: state === 'tool-running' ? [run.runId] : [],
  };
}

// 仅在开发环境的预览路由中启用 fixture。
function getPreviewState(): PreviewState | null {
  if (!import.meta.env.DEV || window.location.pathname !== '/agent/preview') return null;
  const value = new URLSearchParams(window.location.search).get('state') as PreviewState | null;
  return value && PREVIEW_STATES.some((item) => item.id === value) ? value : 'empty';
}

// 根据当前地址选择生产状态或开发预览状态。
export function App() {
  const preview = getPreviewState();
  return (
    <>
      {preview ? <AppShell key={preview} previewState={makeFixture(preview)} /> : <PersistentAgentApp />}
      {preview ? <PreviewSwitcher active={preview} /> : null}
    </>
  );
}

function formatToolDuration(durationMs: number): string {
  return durationMs < 1000 ? `${durationMs} 毫秒` : `${(durationMs / 1000).toFixed(1)} 秒`;
}

// 将持久化 assistant metadata 投影为可恢复的轻量 Workbench。
function workbenchFromPersistedMessage(message: PersistedMessage): WorkbenchState | undefined {
  if (message.role !== 'assistant') return undefined;
  const metadata = assistantAgentMetadataSchema.safeParse(message.metadata);
  if (!metadata.success || !metadata.data.agent?.executions.length) return undefined;
  const { executions, sources } = metadata.data.agent;
  const completedCount = executions.filter((execution) => execution.status === 'completed').length;
  return {
    runId: message.id,
    title: '网页检索',
    subtitle: `${executions.length} 次调用 · ${sources.length} 个检索线索`,
    activeView: sources.length ? 'sources' : 'activity',
    activityStatus: completedCount ? 'completed' : 'failed',
    executions: executions.map((execution) => ({
      toolCallId: execution.toolCallId,
      runId: message.id,
      stepId: execution.toolCallId,
      toolName: execution.toolName,
      title: `搜索：${execution.input.query}`,
      detail: execution.status === 'completed' ? '公开网页检索已完成' : '网页检索未完成',
      status: execution.status,
      elapsed: formatToolDuration(execution.durationMs),
      inputSummary: execution.input.query,
      outputSummary: execution.status === 'completed'
        ? `返回 ${execution.resultCount ?? 0} 条网页结果`
        : execution.error?.detail,
      resultCount: execution.resultCount,
      sourceCount: execution.resultCount,
    })),
    followMode: 'auto',
    sources: sources.map((source, index) => ({
      id: `R${index + 1}`,
      title: source.title,
      domain: source.domain,
      url: source.url,
      excerpt: source.snippet,
      time: new Date(source.retrievedAt).toLocaleString('zh-CN'),
      provider: source.provider,
      kind: 'clue',
    })),
    open: false,
  };
}

function applyToolEvent(
  current: WorkbenchState | undefined,
  event: ToolStreamEvent,
  open: boolean,
): WorkbenchState {
  const base: WorkbenchState = current ?? {
    runId: event.messageId,
    title: '网页检索',
    subtitle: '正在搜索公开网页',
    activeView: 'activity',
    activityStatus: 'running',
    executions: [],
    followMode: 'auto',
    sources: [],
    open,
  };
  if (event.type === 'tool.started') {
    const tool: ToolCallView = {
      toolCallId: event.toolCallId,
      runId: event.messageId,
      stepId: event.toolCallId,
      toolName: event.toolName,
      title: `搜索：${event.input.query}`,
      detail: '正在搜索公开网页',
      status: 'running',
      elapsed: '进行中',
      inputSummary: event.input.query,
    };
    const executions = base.executions.some((item) => item.toolCallId === event.toolCallId)
      ? base.executions
      : [...base.executions, tool];
    return {
      ...base,
      open,
      activityStatus: 'running',
      executions,
      focusTarget: { kind: 'tool_call', runId: event.messageId, stepId: event.toolCallId, toolCallId: event.toolCallId },
    };
  }

  const completedEvent = event.type === 'tool.completed' ? event : undefined;
  const failedEvent = event.type === 'tool.failed' ? event : undefined;
  const status = completedEvent ? 'completed' as const : 'failed' as const;
  const executions = base.executions.map((tool) => tool.toolCallId === event.toolCallId
    ? {
        ...tool,
        status,
        detail: completedEvent ? '公开网页检索已完成' : failedEvent?.detail ?? '工具执行失败',
        elapsed: formatToolDuration(event.durationMs),
        outputSummary: completedEvent
          ? `返回 ${completedEvent.result.results.length} 条网页结果`
          : failedEvent?.detail,
        resultCount: completedEvent?.result.results.length,
        sourceCount: completedEvent?.result.results.length,
      }
    : tool);
  const sourceMap = new Map(base.sources.map((source) => [source.url, source]));
  if (event.type === 'tool.completed') {
    for (const source of event.result.results) {
      if (!sourceMap.has(source.url)) {
        sourceMap.set(source.url, {
          id: `R${sourceMap.size + 1}`,
          title: source.title,
          domain: source.domain,
          url: source.url,
          excerpt: source.snippet,
          time: new Date(event.completedAt).toLocaleString('zh-CN'),
          provider: event.result.provider,
          kind: 'clue',
        });
      }
    }
  }
  const sources = [...sourceMap.values()];
  return {
    ...base,
    open,
    subtitle: `${executions.length} 次调用 · ${sources.length} 个检索线索`,
    activeView: event.type === 'tool.completed' && sources.length ? 'sources' : base.activeView,
    executions,
    sources,
  };
}

// 将持久化消息转换为 Conversation 可直接渲染的项目。
function toConversationItem(message: PersistedMessage): ConversationItem {
  return message.role === 'user'
    ? {
        id: message.id,
        kind: 'user',
        content: message.content,
        createdAt: message.createdAt,
      }
    : {
        id: message.id,
        kind: 'assistant',
        text: message.content,
        content: <p>{message.content}</p>,
        createdAt: message.createdAt,
        workbench: workbenchFromPersistedMessage(message),
      };
}

// 从首条用户输入构造创建会话时使用的临时标题。
function makeProvisionalTitle(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, 28);
}

// 将当前会话选择同步到可刷新恢复的查询参数。
function updateSessionUrl(sessionId: string | null, replace = false): void {
  const url = sessionId ? `/agent?session=${encodeURIComponent(sessionId)}` : '/agent';
  window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
}

// 按置顶优先、最近更新其次的规则稳定排列会话。
function sortSessionSummaries(items: SessionSummary[]): SessionSummary[] {
  return [...items].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

// 管理生产页面的持久化会话、独立缓存和后台流。
function PersistentAgentApp() {
  const [serviceState, setServiceState] = useState<ServiceState>('checking');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionStates, setSessionStates] = useState<Record<string, AgentUiState>>({});
  const [pendingSessions, setPendingSessions] = useState<Record<string, boolean>>({});
  const [draftPending, setDraftPending] = useState(false);
  const [draftState, setDraftState] = useState<AgentUiState>(() => makeFixture('empty'));
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const selectedSessionIdRef = useRef<string | null>(null);
  const pendingSessionsRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  useEffect(() => {
    pendingSessionsRef.current = pendingSessions;
  }, [pendingSessions]);

  // 同步更新 pending ref 和 React 状态，避免异步详情请求读到旧值。
  function setSessionPending(sessionId: string, pending: boolean): void {
    const next = { ...pendingSessionsRef.current, [sessionId]: pending };
    pendingSessionsRef.current = next;
    setPendingSessions(next);
  }

  // 首次进入时检查服务、加载列表并恢复 URL 指定或最近会话。
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([getReadiness(controller.signal), listSessions(controller.signal)])
      .then(([, loadedSessions]) => {
        setServiceState('ready');
        setSessions(loadedSessions);
        const requestedId = new URLSearchParams(window.location.search).get('session');
        const target = loadedSessions.find((session) => session.id === requestedId) ?? loadedSessions[0];
        if (target) {
          setSelectedSessionId(target.id);
          updateSessionUrl(target.id, true);
          void loadSessionDetail(target.id);
        } else {
          updateSessionUrl(null, true);
        }
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        setServiceState('unavailable');
        setError(getErrorMessage(requestError));
      });
    return () => controller.abort();
  }, []);

  // 从 API 覆盖指定会话缓存，以数据库结果作为最终事实。
  async function loadSessionDetail(sessionId: string): Promise<void> {
    if (pendingSessionsRef.current[sessionId]) return;
    try {
      const { session } = await getSession(sessionId);
      if (pendingSessionsRef.current[sessionId]) return;
      setSessionStates((current) => {
        const conversation = session.messages.map(toConversationItem);
        const activeWorkbench = current[sessionId]?.workbench;
        const restoredItem = activeWorkbench
          ? conversation.find((item) => item.kind === 'assistant' && item.id === activeWorkbench.runId)
          : undefined;
        const restoredWorkbench = restoredItem?.kind === 'assistant' ? restoredItem.workbench : undefined;
        return {
          ...current,
          [sessionId]: {
            label: session.title,
            subtitle: '',
            conversation,
            ...(restoredWorkbench
              ? { workbench: { ...restoredWorkbench, open: activeWorkbench?.open ?? false } }
              : {}),
            autoOpenSuppressedRunIds: current[sessionId]?.autoOpenSuppressedRunIds,
          },
        };
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  // 重新读取侧栏顺序，同时保留各会话独立内容缓存。
  async function refreshSessions(): Promise<SessionSummary[]> {
    const loaded = await listSessions();
    setSessions(loaded);
    return loaded;
  }

  // 切换会话时先展示缓存，再异步以服务端详情覆盖。
  function selectSession(sessionId: string): void {
    setSelectedSessionId(sessionId);
    setPrompt('');
    setError(null);
    updateSessionUrl(sessionId);
    setMobileNavOpen(false);
    void loadSessionDetail(sessionId);
  }

  // 新建按钮只进入本地空白草稿，不提前写数据库。
  function startDraft(): void {
    setSelectedSessionId(null);
    setDraftState(makeFixture('empty'));
    setPrompt('');
    setError(null);
    updateSessionUrl(null);
    setMobileNavOpen(false);
  }

  function openPersistedWorkbench(workbench: WorkbenchState): void {
    const sessionId = selectedSessionIdRef.current;
    if (!sessionId) return;
    setSessionStates((current) => {
      const state = current[sessionId];
      if (!state) return current;
      return {
        ...current,
        [sessionId]: {
          ...state,
          workbench: { ...workbench, open: true, followMode: 'pinned' },
        },
      };
    });
  }

  // 删除确认后的会话，并按最新列表决定恢复落点。
  async function removeSession(sessionId: string): Promise<void> {
    const target = sessions.find((session) => session.id === sessionId);
    if (!window.confirm(`确定删除会话“${target?.title ?? '未命名会话'}”吗？`)) return;
    try {
      await deleteSession(sessionId);
      setSessionStates((current) => {
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
      const remaining = await refreshSessions();
      if (selectedSessionIdRef.current !== sessionId) return;
      const next = remaining[0];
      if (next) selectSession(next.id);
      else startDraft();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  // 持久化会话局部更新，并同步侧栏与当前会话标题。
  async function modifySession(
    sessionId: string,
    input: { title?: string; isPinned?: boolean },
  ): Promise<void> {
    try {
      const updated = await updateSession(sessionId, input);
      setSessions((current) => sortSessionSummaries(
        current.map((session) => session.id === sessionId ? updated : session),
      ));
      if (input.title !== undefined) {
        setSessionStates((current) => current[sessionId]
          ? { ...current, [sessionId]: { ...current[sessionId], label: updated.title } }
          : current);
      }
      setError(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      throw requestError;
    }
  }

  // 提交消息；空白草稿先建会话，之后所有流只更新目标 sessionId。
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const task = prompt.trim();
    const currentId = selectedSessionIdRef.current;
    if (!task || (currentId ? pendingSessions[currentId] : draftPending)) return;
    setPrompt('');
    setError(null);
    const createdAt = new Date().toISOString();
    const localUserId = `local-user-${crypto.randomUUID()}`;
    const localAssistantId = `local-assistant-${crypto.randomUUID()}`;
    let sessionId = currentId;
    let isFirstTurn = !sessionId;
    const optimisticUser: ConversationItem = {
      id: localUserId,
      kind: 'user',
      content: task,
      createdAt,
    };
    const optimisticAssistant: ConversationItem = {
      id: localAssistantId,
      kind: 'assistant',
      createdAt,
      content: (
        <p className="assistant-thinking" role="status" aria-live="polite">
          正在思考中…
        </p>
      ),
    };
    if (!sessionId) {
      setDraftPending(true);
      setDraftState({
        label: makeProvisionalTitle(task),
        subtitle: '',
        conversation: [optimisticUser, optimisticAssistant],
      });
    }

    try {
      if (!sessionId) {
        const created = await createSession(makeProvisionalTitle(task));
        sessionId = created.id;
        setSessions((current) => [created, ...current.filter((item) => item.id !== created.id)]);
        setSelectedSessionId(created.id);
        selectedSessionIdRef.current = created.id;
        updateSessionUrl(created.id, true);
      } else {
        const existing = sessionStates[sessionId]?.conversation ?? [];
        isFirstTurn = !existing.some((item) => item.kind === 'assistant' && item.text);
      }

      const targetId = sessionId;
      setSessionStates((current) => {
        const base = current[targetId] ?? {
          label: makeProvisionalTitle(task),
          subtitle: '',
          conversation: [],
        };
        return {
          ...current,
          [targetId]: {
            ...base,
            conversation: [...base.conversation, optimisticUser, optimisticAssistant],
          },
        };
      });
      setSessionPending(targetId, true);

      const completed = await requestChatStream(targetId, task, (delta) => {
        setSessionStates((current) => {
          const target = current[targetId];
          if (!target) return current;
          return {
            ...current,
            [targetId]: {
              ...target,
              conversation: target.conversation.map((item) =>
                item.kind === 'assistant' && item.id === localAssistantId
                  ? {
                      ...item,
                      text: `${item.text ?? ''}${delta}`,
                      content: <p>{`${item.text ?? ''}${delta}`}</p>,
                    }
                  : item,
              ),
            },
          };
        });
      }, (toolEvent) => {
        setSessionStates((current) => {
          const target = current[targetId];
          if (!target) return current;
          const suppressed = target.autoOpenSuppressedRunIds?.includes(toolEvent.messageId) ?? false;
          const existing = target.workbench?.runId === toolEvent.messageId ? target.workbench : undefined;
          const open = existing ? existing.open : !suppressed;
          const workbench = applyToolEvent(existing, toolEvent, open);
          return {
            ...current,
            [targetId]: {
              ...target,
              workbench,
              conversation: target.conversation.map((item) =>
                item.kind === 'assistant' && item.id === localAssistantId
                  ? { ...item, workbench }
                  : item,
              ),
            },
          };
        });
      });
      setSessionPending(targetId, false);
      setSessionStates((current) => {
        const target = current[targetId];
        if (!target) return current;
        const completedWorkbench = target.workbench?.runId === completed.messageId
          ? { ...target.workbench, activityStatus: 'completed' as const }
          : target.workbench;
        return {
          ...current,
          [targetId]: {
            ...target,
            workbench: completedWorkbench,
            conversation: target.conversation.map((item) =>
              item.id === localAssistantId
                ? { ...item, id: completed.messageId, workbench: completedWorkbench }
                : item,
            ),
          },
        };
      });
      await loadSessionDetail(targetId);
      try {
        await refreshSessions();
      } catch {
        // 回答已经交付，侧栏刷新失败不回滚消息。
      }
      if (isFirstTurn) {
        try {
          const titleResult = await generateSessionTitle(targetId);
          setSessions((current) =>
            current
              .map((item) => item.id === targetId ? titleResult.session : item)
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
          );
          setSessionStates((current) => current[targetId]
            ? { ...current, [targetId]: { ...current[targetId], label: titleResult.session.title } }
            : current);
        } catch {
          // 标题生成是非关键后处理，失败时保留临时标题。
        }
      }
    } catch (requestError) {
      if (sessionId) {
        const targetId = sessionId;
        setSessionStates((current) => {
          const target = current[targetId];
          if (!target) return current;
          return {
            ...current,
            [targetId]: {
              ...target,
              conversation: target.conversation.map((item) =>
                item.kind === 'assistant' && item.id === localAssistantId
                  ? {
                      ...item,
                      content: <p className="assistant-failed">本次回答未完成，请稍后重试。</p>,
                    }
                  : item,
              ),
            },
          };
        });
        void refreshSessions();
      } else {
        setPrompt(task);
        setDraftState(makeFixture('empty'));
      }
      setError(getErrorMessage(requestError));
    } finally {
      if (sessionId) {
        const targetId = sessionId;
        setSessionPending(targetId, false);
      }
      setDraftPending(false);
    }
  }

  const uiState = selectedSessionId
    ? sessionStates[selectedSessionId] ?? {
        label: sessions.find((session) => session.id === selectedSessionId)?.title ?? '加载中…',
        subtitle: '',
        conversation: [],
      }
    : draftState;
  const submitting = selectedSessionId ? Boolean(pendingSessions[selectedSessionId]) : draftPending;
  const hasWorkbench = Boolean(uiState.workbench?.open);

  return (
    <div className="app-shell">
      <Sidebar
        serviceState={serviceState}
        serviceLabel=""
        mobileNavOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        sessions={sessions}
        selectedSessionId={selectedSessionId}
        pendingSessions={pendingSessions}
        onNew={startDraft}
        onSelect={selectSession}
        onDelete={(sessionId) => void removeSession(sessionId)}
        onRename={(sessionId, title) => modifySession(sessionId, { title })}
        onTogglePin={(sessionId, isPinned) => void modifySession(sessionId, { isPinned })}
      />
      {mobileNavOpen ? (
        <button className="mobile-backdrop" type="button" aria-label="关闭会话栏" onClick={() => setMobileNavOpen(false)} />
      ) : null}
      <main className="main-shell">
        <header className="topbar">
          <button className="icon-button open-mobile-nav" type="button" aria-label="打开会话栏" title="打开会话栏" onClick={() => setMobileNavOpen(true)}>
            <Menu size={18} />
          </button>
          <div className="task-title"><span className="task-title__label">{uiState.label}</span></div>
        </header>
        <div className={`workbench-grid ${hasWorkbench ? 'has-workbench' : 'without-workbench'}`}>
          <Conversation
            state={uiState}
            error={error}
            onDismissError={() => setError(null)}
            onRunChange={() => undefined}
            onFocusWorkbench={() => undefined}
            onOpenWorkbench={openPersistedWorkbench}
            prompt={prompt}
            submitting={submitting}
            serviceState={serviceState}
            composerMode="new-run"
            onPromptChange={setPrompt}
            onSubmit={(event) => void handleSubmit(event)}
          />
          {uiState.workbench ? (
            <WorkbenchShell
              state={uiState.workbench}
              onViewChange={(activeView) => {
                if (!selectedSessionId) return;
                setSessionStates((current) => current[selectedSessionId]?.workbench
                  ? {
                      ...current,
                      [selectedSessionId]: {
                        ...current[selectedSessionId],
                        workbench: { ...current[selectedSessionId].workbench!, activeView },
                      },
                    }
                  : current);
              }}
              onExecutionSelect={(tool) => {
                if (!selectedSessionId) return;
                setSessionStates((current) => current[selectedSessionId]?.workbench
                  ? {
                      ...current,
                      [selectedSessionId]: {
                        ...current[selectedSessionId],
                        workbench: {
                          ...current[selectedSessionId].workbench!,
                          followMode: 'pinned',
                          focusTarget: { kind: 'tool_call', runId: tool.runId, stepId: tool.stepId, toolCallId: tool.toolCallId },
                        },
                      },
                    }
                  : current);
              }}
              onClose={() => {
                if (!selectedSessionId) return;
                setSessionStates((current) => {
                  const state = current[selectedSessionId];
                  if (!state?.workbench) return current;
                  return {
                    ...current,
                    [selectedSessionId]: {
                      ...state,
                      autoOpenSuppressedRunIds: [...new Set([...(state.autoOpenSuppressedRunIds ?? []), state.workbench.runId])],
                      workbench: { ...state.workbench, open: false },
                    },
                  };
                });
              }}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}

// 渲染仅开发环境可用的 fixture 状态切换器。
function PreviewSwitcher({ active }: { active: PreviewState }) {
  return (
    <div className="preview-switcher" role="navigation" aria-label="预览状态">
      <span className="preview-switcher__label">Mock</span>
      <div className="preview-switcher__states">
        {PREVIEW_STATES.map((item) => (
          <a
            key={item.id}
            className={`preview-chip ${active === item.id ? 'is-active' : ''}`}
            href={`/agent/preview?state=${item.id}`}
            aria-current={active === item.id ? 'page' : undefined}
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}

// 管理服务、对话以及 Run/Workbench 的状态转换。
export function AppShell({ previewState }: { previewState?: AgentUiState }) {
  const [serviceState, setServiceState] = useState<ServiceState>(
    previewState ? 'ready' : 'checking',
  );
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [uiState, setUiState] = useState<AgentUiState>(previewState ?? makeFixture('empty'));

  useEffect(() => {
    if (previewState) return;
    const controller = new AbortController();
    void getReadiness(controller.signal)
      .then(() => setServiceState('ready'))
      .catch(() => setServiceState('unavailable'));
    return () => controller.abort();
  }, [previewState]);

  const composerMode =
    uiState.run?.status === 'running'
      ? 'steer'
      : uiState.run?.status === 'waiting'
        ? 'clarification'
        : uiState.run?.status === 'cancelling'
          ? 'disabled'
          : 'new-run';

  // 将 RunCard 变化同步到对话和对应的 Workbench。
  function updateRun(run: RunCardState) {
    setUiState((current) => {
      const latestTool = run.toolCalls.at(-1);
      const workbench =
        current.workbench?.runId === run.runId
          ? {
              ...current.workbench,
              activityStatus: run.status,
              executions: run.toolCalls,
              focusTarget:
                current.workbench.followMode === 'auto' && latestTool
                  ? ({
                      kind: 'tool_call',
                      runId: latestTool.runId,
                      stepId: latestTool.stepId,
                      toolCallId: latestTool.toolCallId,
                    } satisfies WorkbenchFocusTarget)
                  : current.workbench.focusTarget,
            }
          : current.workbench;
      return {
        ...current,
        run: current.run?.runId === run.runId ? run : current.run,
        conversation: current.conversation.map((item) =>
          item.kind === 'run' && item.run.runId === run.runId ? { ...item, run } : item,
        ),
        workbench,
      };
    });
  }

  // 打开 Workbench 并记录用户是否固定了当前定位。
  function focusWorkbench(target: WorkbenchFocusTarget, pinned = true) {
    setUiState((current) => {
      if (!current.workbench || current.workbench.runId !== target.runId) return current;
      const activeView: WorkspaceView =
        target.kind === 'source' ? 'sources' : target.kind === 'report' ? 'report' : 'activity';
      return {
        ...current,
        workbench: {
          ...current.workbench,
          open: true,
          activeView,
          focusTarget: target,
          followMode: pinned ? 'pinned' : 'auto',
        },
      };
    });
  }

  // 处理预览操作，或提交生产环境的聊天流。
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const task = prompt.trim();
    if (!task || submitting) return;
    setSubmitting(true);
    setError(null);
    setPrompt('');
    if (previewState) {
      if (composerMode === 'steer' && uiState.run) {
        const run = {
          ...uiState.run,
          currentAction: '已接受调整，将从下一步骤应用',
        };
        setUiState((current) => ({
          ...current,
          run,
          conversation: [
            ...current.conversation.map((item) =>
              item.kind === 'run' && item.run.runId === run.runId ? { ...item, run } : item,
            ),
            { id: `u-${Date.now()}`, kind: 'user', content: task, createdAt: new Date().toISOString() },
            {
              id: `a-${Date.now()}`,
              kind: 'assistant',
              content: <p>已接受调整，将从下一步骤应用。</p>,
            },
          ],
        }));
      } else if (composerMode === 'clarification' && uiState.run) {
        const toolCalls = uiState.run.toolCalls.map((tool, index, items) =>
          index === items.length - 1 ? { ...tool, status: 'running' as const } : tool,
        );
        const run = {
          ...uiState.run,
          status: 'running' as const,
          stage: '检索中',
          currentAction: '已确认时间范围，继续交叉验证',
          toolCalls,
        };
        setUiState((current) => ({
          ...current,
          run,
          conversation: [
            ...current.conversation.map((item) =>
              item.kind === 'run' && item.run.runId === run.runId ? { ...item, run } : item,
            ),
            { id: `u-${Date.now()}`, kind: 'user', content: task, createdAt: new Date().toISOString() },
          ],
          workbench:
            current.workbench?.runId === run.runId
              ? {
                  ...current.workbench,
                  activityStatus: 'running',
                  executions: toolCalls,
                }
              : current.workbench,
        }));
      } else {
        const next = makeFixture('tool-running-open');
        setUiState({
          ...next,
          label: task.slice(0, 28),
          conversation: [
            { id: 'u1', kind: 'user', content: task, createdAt: new Date().toISOString() },
            { id: 'r1', kind: 'run', run: next.run! },
          ],
        });
      }
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
  }

  const serviceLabel = { checking: '检查服务', ready: '服务已就绪', unavailable: '服务不可用' }[
    serviceState
  ];
  const hasWorkbench = Boolean(uiState.workbench?.open);
  return (
    <div className="app-shell">
      <Sidebar
        serviceState={serviceState}
        serviceLabel={serviceLabel}
        mobileNavOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />
      {mobileNavOpen ? (
        <button
          className="mobile-backdrop"
          type="button"
          aria-label="关闭会话栏"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}
      <main className="main-shell">
        <header className="topbar">
          <button
            className="icon-button open-mobile-nav"
            type="button"
            aria-label="打开会话栏"
            title="打开会话栏"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={18} />
          </button>
          <div className="task-title">
            <span className="task-title__label">{uiState.label}</span>
          {uiState.subtitle ? <span className="task-title__meta">{uiState.subtitle}</span> : null}
        </div>
        </header>
        <div className={`workbench-grid ${hasWorkbench ? 'has-workbench' : 'without-workbench'}`}>
          <Conversation
            state={uiState}
            error={error}
            onDismissError={() => setError(null)}
            onRunChange={updateRun}
            onFocusWorkbench={(target) => focusWorkbench(target)}
            onOpenWorkbench={(workbench) => setUiState((current) => ({
              ...current,
              workbench: { ...workbench, open: true, followMode: 'pinned' },
            }))}
            prompt={prompt}
            submitting={submitting}
            serviceState={serviceState}
            composerMode={composerMode}
            onPromptChange={setPrompt}
            onSubmit={handleSubmit}
          />
          {uiState.workbench ? (
            <WorkbenchShell
              state={uiState.workbench}
              onViewChange={(activeView) =>
                setUiState((current) =>
                  current.workbench
                    ? { ...current, workbench: { ...current.workbench, activeView } }
                    : current,
                )
              }
              onExecutionSelect={(tool) =>
                focusWorkbench({
                  kind: 'tool_call',
                  runId: tool.runId,
                  stepId: tool.stepId,
                  toolCallId: tool.toolCallId,
                })
              }
              onClose={() =>
                setUiState((current) => {
                  if (!current.workbench) return current;
                  return {
                    ...current,
                    autoOpenSuppressedRunIds: [
                      ...new Set([
                        ...(current.autoOpenSuppressedRunIds ?? []),
                        current.workbench.runId,
                      ]),
                    ],
                    workbench: { ...current.workbench, open: false },
                  };
                })
              }
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}

// 渲染会话导航和当前本地工作区身份。
function Sidebar({
  serviceState,
  serviceLabel,
  mobileNavOpen,
  onClose,
  sessions,
  selectedSessionId,
  pendingSessions,
  onNew,
  onSelect,
  onDelete,
  onRename,
  onTogglePin,
}: {
  serviceState: ServiceState;
  serviceLabel: string;
  mobileNavOpen: boolean;
  onClose: () => void;
  sessions?: SessionSummary[];
  selectedSessionId?: string | null;
  pendingSessions?: Record<string, boolean>;
  onNew?: () => void;
  onSelect?: (sessionId: string) => void;
  onDelete?: (sessionId: string) => void;
  onRename?: (sessionId: string, title: string) => Promise<void>;
  onTogglePin?: (sessionId: string, isPinned: boolean) => void;
}) {
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [editingSession, setEditingSession] = useState<SessionSummary | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);

  // 在菜单外点击或按 Escape 时关闭临时操作界面。
  useEffect(() => {
    function closeTransientUi(event: PointerEvent | KeyboardEvent): void {
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        setMenuSessionId(null);
        setMenuAnchor(null);
        if (!savingTitle) setEditingSession(null);
        return;
      }
      if (event instanceof PointerEvent && !(event.target as Element).closest('.session-actions, .session-menu')) {
        setMenuSessionId(null);
        setMenuAnchor(null);
      }
    }
    document.addEventListener('pointerdown', closeTransientUi);
    document.addEventListener('keydown', closeTransientUi);
    return () => {
      document.removeEventListener('pointerdown', closeTransientUi);
      document.removeEventListener('keydown', closeTransientUi);
    };
  }, [savingTitle]);

  // 打开重命名对话框并预填当前标题。
  function openRename(session: SessionSummary): void {
    setMenuSessionId(null);
    setMenuAnchor(null);
    setEditingSession(session);
    setEditTitle(session.title);
  }

  // 将菜单锚定到更多按钮下方，必要时先滚动列表为菜单留出空间。
  function toggleSessionMenu(
    sessionId: string,
    event: ReactMouseEvent<HTMLButtonElement>,
  ): void {
    if (menuSessionId === sessionId) {
      setMenuSessionId(null);
      setMenuAnchor(null);
      return;
    }
    const button = event.currentTarget;
    const list = button.closest('.session-list');
    const initialRect = button.getBoundingClientRect();
    const overflow = initialRect.bottom + 142 - window.innerHeight;

    const openAtCurrentPosition = () => {
      const rect = button.getBoundingClientRect();
      setMenuAnchor({
        top: rect.bottom + 6,
        left: Math.max(8, Math.min(rect.right - 154, window.innerWidth - 162)),
      });
      setMenuSessionId(sessionId);
    };

    if (overflow > 0 && list) {
      list.scrollBy({ top: overflow + 8 });
      requestAnimationFrame(openAtCurrentPosition);
    } else {
      openAtCurrentPosition();
    }
  }

  // 校验并提交新的会话名称。
  async function submitRename(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const title = editTitle.replace(/\s+/g, ' ').trim();
    if (!editingSession || !title || title.length > 28 || title === editingSession.title) return;
    setSavingTitle(true);
    try {
      await onRename?.(editingSession.id, title);
      setEditingSession(null);
    } finally {
      setSavingTitle(false);
    }
  }

  return (
    <>
    <aside className={`session-sidebar ${mobileNavOpen ? 'session-sidebar--open' : ''}`}>
      <div className="brand-row">
        <div className="brand-mark" aria-hidden="true">
          H
        </div>
        <div>
          <strong>Harness</strong>
          <span>Agent Workbench</span>
        </div>
        <button
          className="icon-button close-mobile-nav"
          type="button"
          aria-label="关闭会话栏"
          title="关闭会话栏"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div className="sidebar-heading">
        <span>会话</span>
        <button className="icon-button" type="button" aria-label="新建会话" title="新建会话" onClick={onNew}>
          <Plus size={18} />
        </button>
      </div>
      <div className="session-list">
        {sessions && selectedSessionId === null ? (
          <div className="session-row">
            <button className="session-item is-active" type="button">
              <strong>新任务</strong>
            </button>
          </div>
        ) : null}
        {sessions ? sessions.map((session) => (
          <div className="session-row" key={session.id}>
            <button
              className={`session-item ${selectedSessionId === session.id ? 'is-active' : ''}`}
              type="button"
              onClick={() => onSelect?.(session.id)}
              aria-label={pendingSessions?.[session.id] ? `${session.title}，正在生成回复` : session.title}
            >
              <strong>{session.title}</strong>
            </button>
            <div className="session-actions">
              <button
                className="session-more icon-button icon-button--small"
                type="button"
                aria-label={`更多操作 ${session.title}`}
                aria-haspopup="menu"
                aria-expanded={menuSessionId === session.id}
                title="更多操作"
                onClick={(event) => toggleSessionMenu(session.id, event)}
              >
                <Ellipsis size={16} />
              </button>
            </div>
          </div>
        )) : (
          <>
            <button className="session-item is-active" type="button">
              <strong>新任务</strong>
            </button>
            <div className="sidebar-section"><span>最近使用</span></div>
            <div className="sessions-empty">
              <span>暂无其他会话</span>
            </div>
          </>
        )}
        {sessions && sessions.length === 0 && selectedSessionId !== null ? (
          <div className="sessions-empty"><span>暂无会话</span></div>
        ) : null}
      </div>
      {serviceLabel ? (
        <div className="sidebar-footer">
          <span className={`status-dot status-dot--${serviceState}`} aria-hidden="true" />
          <span>{serviceLabel}</span>
          <span className="local-badge">本地</span>
        </div>
      ) : null}
    </aside>
    {menuSessionId && menuAnchor && sessions ? (() => {
      const session = sessions.find((item) => item.id === menuSessionId);
      return session ? createPortal(
        <div
          className="session-menu"
          role="menu"
          aria-label={`${session.title} 会话操作`}
          style={{ top: menuAnchor.top, left: menuAnchor.left }}
        >
          <button type="button" role="menuitem" onClick={() => openRename(session)}>
            <Pencil size={15} /><span>重命名</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuSessionId(null);
              setMenuAnchor(null);
              onTogglePin?.(session.id, !session.isPinned);
            }}
          >
            {session.isPinned ? <PinOff size={15} /> : <Pin size={15} />}
            <span>{session.isPinned ? '取消置顶' : '置顶'}</span>
          </button>
          <div className="session-menu__separator" />
          <button
            className="session-menu__danger"
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuSessionId(null);
              setMenuAnchor(null);
              onDelete?.(session.id);
            }}
          >
            <Trash2 size={15} /><span>删除</span>
          </button>
        </div>,
        document.body,
      ) : null;
    })() : null}
    {editingSession ? createPortal(
      <div className="rename-dialog-backdrop" role="presentation" onMouseDown={() => !savingTitle && setEditingSession(null)}>
        <form
          className="rename-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-dialog-title"
          onSubmit={(event) => void submitRename(event)}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="rename-dialog__header">
            <h2 id="rename-dialog-title">编辑会话名称</h2>
            <button className="icon-button" type="button" aria-label="关闭" onClick={() => setEditingSession(null)} disabled={savingTitle}>
              <X size={18} />
            </button>
          </div>
          <label htmlFor="session-title-input">会话名称</label>
          <input
            id="session-title-input"
            autoFocus
            maxLength={28}
            value={editTitle}
            onChange={(event) => setEditTitle(event.target.value)}
          />
          <div className="rename-dialog__actions">
            <button className="secondary-button" type="button" onClick={() => setEditingSession(null)} disabled={savingTitle}>取消</button>
            <button className="primary-button" type="submit" disabled={savingTitle || !editTitle.trim() || editTitle.trim() === editingSession.title}>
              {savingTitle ? '保存中…' : '确认'}
            </button>
          </div>
        </form>
      </div>,
      document.body,
    ) : null}
    </>
  );
}

// 渲染消息时间线、运行卡片、错误提示和 Composer。
function Conversation({
  state,
  error,
  onDismissError,
  onRunChange,
  onFocusWorkbench,
  onOpenWorkbench,
  prompt,
  submitting,
  serviceState,
  composerMode,
  onPromptChange,
  onSubmit,
}: {
  state: AgentUiState;
  error: string | null;
  onDismissError: () => void;
  onRunChange: (run: RunCardState) => void;
  onFocusWorkbench: (target: WorkbenchFocusTarget) => void;
  onOpenWorkbench: (workbench: WorkbenchState) => void;
  prompt: string;
  submitting: boolean;
  serviceState: ServiceState;
  composerMode: 'new-run' | 'steer' | 'clarification' | 'disabled';
  onPromptChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);

  // 用户发送消息时强制回到底部，开始观察新的回复。
  function handleComposerSubmit(event: FormEvent<HTMLFormElement>) {
    stickToBottomRef.current = true;
    onSubmit(event);
  }

  // 仅当用户接近底部时，继续跟随流式消息增长。
  function handleConversationScroll() {
    const node = scrollRef.current;
    if (!node) return;
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 32;
  }

  useEffect(() => {
    if (!stickToBottomRef.current || !scrollRef.current) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      if (!stickToBottomRef.current) return;
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [state.conversation]);

  return (
    <section className="conversation" aria-label="对话">
      <div
        className="conversation-scroll"
        ref={scrollRef}
        onScroll={handleConversationScroll}
      >
        {state.conversation.length === 0 ? (
          <div className="conversation-empty">
            <div className="empty-icon">
              <Sparkles size={22} />
            </div>
            <h1>今天想完成什么任务？</h1>
          </div>
        ) : (
          <div className="message-list">
            {state.conversation.map((item) =>
              item.kind === 'user' ? (
                <div className="message message--user" key={item.id}>
                  <div>
                    <div className="user-bubble">
                      <MarkdownContent>{item.content}</MarkdownContent>
                    </div>
                    <div className="message-actions">
                      <span>{formatMessageTime(item.createdAt, item.time)}</span>
                      <CopyButton text={item.content} />
                    </div>
                  </div>
                  <div className="message-avatar user-avatar" aria-hidden="true">
                    <CircleUserRound size={17} />
                  </div>
                </div>
              ) : item.kind === 'assistant' ? (
                <div className="message message--assistant" key={item.id}>
                  <div className="message-avatar assistant-avatar">
                    <Sparkles size={15} />
                  </div>
                  <div className="assistant-content">
                    <div className="message-meta">Harness</div>
                    {item.text !== undefined ? (
                      <MarkdownContent>{item.text}</MarkdownContent>
                    ) : (
                      item.content
                    )}
                    {item.workbench ? (
                      <button
                        className="assistant-tool-summary"
                        type="button"
                        onClick={() => onOpenWorkbench(item.workbench!)}
                      >
                        <Search size={14} />
                        <span>
                          {item.workbench.executions.length} 次检索 · {item.workbench.sources.length} 个线索
                        </span>
                        <ChevronRight size={14} />
                      </button>
                    ) : null}
                    <div className="message-actions">
                      <span>{formatMessageTime(item.createdAt, item.time)}</span>
                      {item.text !== undefined ? <CopyButton text={item.text} /> : null}
                    </div>
                  </div>
                </div>
              ) : (
                <RunCard
                  key={item.id}
                  run={item.run}
                  onChange={onRunChange}
                  onFocusWorkbench={onFocusWorkbench}
                />
              ),
            )}
          </div>
        )}
      </div>
      <div className="composer-area">
        {error ? (
          <div className="error-notice" role="alert">
            <CircleAlert size={17} />
            <span>{error}</span>
            <button
              className="icon-button icon-button--small"
              type="button"
              aria-label="关闭错误提示"
              title="关闭错误提示"
              onClick={onDismissError}
            >
              <X size={15} />
            </button>
          </div>
        ) : null}
        <Composer
          prompt={prompt}
          submitting={submitting}
          serviceState={serviceState}
          mode={composerMode}
          onPromptChange={onPromptChange}
          onSubmit={handleComposerSubmit}
        />
      </div>
    </section>
  );
}

// 提供优先支持键盘操作的消息、调整和确认输入。
function Composer({
  prompt,
  submitting,
  serviceState,
  mode,
  onPromptChange,
  onSubmit,
}: {
  prompt: string;
  submitting: boolean;
  serviceState: ServiceState;
  mode: 'new-run' | 'steer' | 'clarification' | 'disabled';
  onPromptChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="composer" onSubmit={onSubmit}>
      <textarea
        aria-label="任务输入"
        placeholder={
          mode === 'steer'
            ? '补充方向，将从下一步骤应用……'
            : mode === 'clarification'
              ? '回答确认问题以继续……'
              : mode === 'disabled'
                ? '正在取消当前任务……'
                : '描述你想完成的任务……'
        }
        rows={3}
        value={prompt}
        disabled={mode === 'disabled'}
        onChange={(event) => onPromptChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (prompt.trim() && !submitting && mode !== 'disabled') {
              event.currentTarget.form?.requestSubmit();
            }
          }
        }}
      />
      <div className="composer-actions">
        {mode === 'steer' || mode === 'clarification' ? (
          <div className="composer-hints">
            <SlidersHorizontal size={14} />
            <span>
              {mode === 'steer' ? '作为调整提交 · 下一步骤生效' : '回答后继续当前任务'}
            </span>
          </div>
        ) : (
          <span />
        )}
        <button
          className="send-button"
          type="submit"
          aria-label="发送任务"
          title="发送任务"
          disabled={!prompt.trim() || submitting || serviceState !== 'ready' || mode === 'disabled'}
        >
          {submitting ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
        </button>
      </div>
    </form>
  );
}

// 汇总一次运行，并提供稳定控制和工具调用定位入口。
function RunCard({
  run,
  onChange,
  onFocusWorkbench,
}: {
  run: RunCardState;
  onChange: (run: RunCardState) => void;
  onFocusWorkbench: (target: WorkbenchFocusTarget) => void;
}) {
  const [expanded, setExpanded] = useState(run.status === 'running' || run.status === 'waiting');
  const statusIcon: Record<RunCardState['status'], LucideIcon> = {
    running: LoaderCircle,
    completed: Check,
    waiting: Clock3,
    cancelling: LoaderCircle,
    cancelled: X,
    failed: CircleAlert,
  };
  const Icon = statusIcon[run.status];
  const canCancel = run.status === 'running' || run.status === 'waiting';
  const isBusy = run.status === 'running' || run.status === 'cancelling';
  const focusedTool = run.toolCalls.at(-1);
  const openTool = (tool: ToolCallView) =>
    onFocusWorkbench({
      kind: 'tool_call',
      runId: tool.runId,
      stepId: tool.stepId,
      toolCallId: tool.toolCallId,
    });
  return (
    <div className={`run-card run-card--${run.status}`}>
      <div className="run-card-header">
        <button
          className="run-card-main"
          type="button"
          aria-label={`打开 ${run.stage} 的工作台`}
          onClick={() =>
            focusedTool
              ? openTool(focusedTool)
              : onFocusWorkbench({ kind: 'activity', runId: run.runId })
          }
        >
          <span className="run-status-icon">
            <Icon className={isBusy ? 'spin' : ''} size={16} />
          </span>
          <span className="run-card-title">
            <strong>{run.stage}</strong>
            <span>{run.currentAction}</span>
          </span>
          <span className="run-card-time">{run.elapsed}</span>
        </button>
        <button
          className="icon-button icon-button--small run-toggle"
          type="button"
          aria-label={expanded ? '收起运行详情' : '展开运行详情'}
          title={expanded ? '收起运行详情' : '展开运行详情'}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
      </div>
      {run.status === 'completed' && !expanded ? (
        <div className="run-summary">{run.summary}</div>
      ) : null}
      <div
        className={`run-card-collapse ${expanded ? 'is-expanded' : ''}`}
        aria-hidden={!expanded}
        inert={!expanded}
      >
        <div className="run-card-collapse-inner">
          <div className="run-card-body">
            <div className="run-progress">
              <span>
                <Globe2 size={14} />
                {run.queryCount} 次检索
              </span>
              <span>
                <Search size={14} />
                {run.sourceCount} 个来源
              </span>
            </div>
            <div className="run-progress-steps" aria-label="运行阶段">
              {run.progress.map((item) => (
                <span className={`progress-step progress-step--${item.status}`} key={item.id}>
                  {item.status === 'completed' ? (
                    <Check size={12} />
                  ) : (
                    <span className="event-mark" />
                  )}
                  {item.label}
                </span>
              ))}
            </div>
            <div className="tool-call-list">
              <div className="section-label">工具调用</div>
              {run.toolCalls.map((tool) => {
                const ToolIcon =
                  tool.status === 'completed'
                    ? Check
                    : tool.status === 'failed'
                      ? CircleAlert
                      : tool.status === 'waiting'
                        ? Clock3
                        : tool.status === 'cancelled'
                          ? X
                          : LoaderCircle;
                const toolBusy = tool.status === 'running' || tool.status === 'cancelling';
                return (
                  <button
                    className="tool-call-row"
                    type="button"
                    key={tool.toolCallId}
                    onClick={() => openTool(tool)}
                  >
                    <span className={`tool-call-status tool-call-status--${tool.status}`}>
                      <ToolIcon className={toolBusy ? 'spin' : ''} size={13} />
                    </span>
                    <span>
                      <strong>{tool.title}</strong>
                      <small>{tool.detail}</small>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                );
              })}
            </div>
            {canCancel ? (
              <div className="run-controls">
                <button
                  className="text-button danger"
                  type="button"
                  onClick={() => {
                    const toolCalls = run.toolCalls.map((tool, index, items) =>
                      index === items.length - 1
                        ? {
                            ...tool,
                            status: 'cancelling' as const,
                            outputSummary: '正在停止当前搜索请求',
                          }
                        : tool,
                    );
                    onChange({
                      ...run,
                      status: 'cancelling',
                      stage: '正在取消',
                      currentAction: '正在安全停止当前步骤',
                      toolCalls,
                    });
                  }}
                >
                  <X size={15} />
                  取消
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// 在统一 Workbench 容器中承载不同工具的视图。
function WorkbenchShell({
  state,
  onClose,
  onViewChange,
  onExecutionSelect,
}: {
  state: WorkbenchState;
  onClose: () => void;
  onViewChange: (view: WorkspaceView) => void;
  onExecutionSelect: (tool: ToolCallView) => void;
}) {
  const views = useMemo(() => {
    const result: Array<{ id: WorkspaceView; label: string; icon: LucideIcon }> = [
      { id: 'activity', label: 'Activity', icon: LoaderCircle },
    ];
    if (state.sources.length) result.push({ id: 'sources', label: 'Sources', icon: Search });
    if (state.report) result.push({ id: 'report', label: 'Report', icon: FileText });
    return result;
  }, [state.report, state.sources.length]);
  return (
    <aside
      className={`resource-workspace ${state.open ? 'is-open' : ''}`}
      aria-label="工作区"
      aria-hidden={!state.open}
      inert={!state.open}
    >
      <header className="workspace-header">
        <div>
          <div className="workspace-kicker">
            <PanelRight size={14} />
            Workbench
          </div>
          <h2>{state.title}</h2>
          <p>{state.subtitle}</p>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="收起工作区"
          title="收起工作区"
          onClick={onClose}
        >
          <PanelRight size={17} />
        </button>
      </header>
      <div className="workspace-tabs" role="tablist" aria-label="工作区视图">
        {views.map(({ id, label, icon: TabIcon }) => (
          <button
            className={`workspace-tab ${state.activeView === id ? 'is-active' : ''}`}
            key={id}
            type="button"
            role="tab"
            aria-selected={state.activeView === id}
            onClick={() => onViewChange(id)}
          >
            <TabIcon
              size={15}
              className={
                id === 'activity' &&
                state.activeView === id &&
                (state.activityStatus === 'running' || state.activityStatus === 'cancelling')
                  ? 'spin'
                  : ''
              }
            />
            {label}
          </button>
        ))}
      </div>
      <div className="workspace-content">
        {state.activeView === 'activity' ? (
          <ActivityView
            executions={state.executions}
            focusTarget={state.focusTarget}
            followMode={state.followMode}
            status={state.activityStatus ?? 'running'}
            onSelect={onExecutionSelect}
          />
        ) : state.activeView === 'sources' ? (
          <SourcesView sources={state.sources} />
        ) : state.report ? (
          <ReportView report={state.report} sources={state.sources} />
        ) : null}
      </div>
    </aside>
  );
}

// 展示执行时间线和当前选中的工具调用详情。
function ActivityView({
  executions,
  focusTarget,
  followMode,
  status,
  onSelect,
}: {
  executions: ToolCallView[];
  focusTarget?: WorkbenchFocusTarget;
  followMode: 'auto' | 'pinned';
  status: ActivityStatus;
  onSelect: (tool: ToolCallView) => void;
}) {
  const heading: Record<ActivityStatus, { title: string; subtitle: string }> = {
    running: { title: '正在执行网页检索', subtitle: '逐步寻找并验证可引用证据' },
    waiting: { title: '等待你的确认', subtitle: '确认后才会继续检索与筛选' },
    cancelling: { title: '正在安全取消', subtitle: '停止当前工具调用并保留已有快照' },
    cancelled: { title: '任务已取消', subtitle: '取消前收集到的来源仍可查看' },
    failed: { title: '执行失败', subtitle: '供应商异常，可稍后重试' },
    completed: { title: '检索与复核已完成', subtitle: '报告已生成，可查看来源与文件' },
  };
  const { title, subtitle } = heading[status];
  const isBusy = status === 'running' || status === 'cancelling';
  const selectedTool =
    focusTarget?.kind === 'tool_call'
      ? executions.find((tool) => tool.toolCallId === focusTarget.toolCallId)
      : executions.at(-1);

  // 根据工具状态选择时间线图标。
  function toolIcon(toolStatus: ToolCallStatus): LucideIcon {
    if (toolStatus === 'completed') return Check;
    if (toolStatus === 'failed') return CircleAlert;
    if (toolStatus === 'waiting') return Clock3;
    if (toolStatus === 'cancelled') return X;
    return LoaderCircle;
  }

  return (
    <div className="activity-view">
      <div className="activity-heading">
        <div className={`activity-loader activity-loader--${status}`}>
          {status === 'failed' ? (
            <CircleAlert size={20} />
          ) : status === 'cancelled' ? (
            <X size={20} />
          ) : status === 'waiting' ? (
            <Clock3 size={20} />
          ) : status === 'completed' ? (
            <Check size={20} />
          ) : (
            <LoaderCircle className={isBusy ? 'spin' : ''} size={20} />
          )}
        </div>
        <div>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <span className="follow-mode">{followMode === 'auto' ? '自动跟随' : '已固定'}</span>
      </div>
      <div className="execution-timeline">
        <div className="section-label">调用时间线</div>
        {executions.map((tool) => {
          const ToolIcon = toolIcon(tool.status);
          const selected = selectedTool?.toolCallId === tool.toolCallId;
          const busy = tool.status === 'running' || tool.status === 'cancelling';
          return (
            <button
              className={`execution-item ${selected ? 'is-selected' : ''}`}
              type="button"
              key={tool.toolCallId}
              aria-pressed={selected}
              onClick={() => onSelect(tool)}
            >
              <span className={`tool-call-status tool-call-status--${tool.status}`}>
                <ToolIcon className={busy ? 'spin' : ''} size={13} />
              </span>
              <span>
                <strong>{tool.title}</strong>
                <small>{tool.elapsed}</small>
              </span>
              <ChevronRight size={14} />
            </button>
          );
        })}
      </div>
      {selectedTool ? (
        <article className="execution-detail" key={selectedTool.toolCallId} tabIndex={-1}>
          <div className="execution-detail-heading">
            <div>
              <span className="tool-name">{selectedTool.toolName}</span>
              <h3>{selectedTool.title}</h3>
            </div>
            <span className={`execution-status execution-status--${selectedTool.status}`}>
              {selectedTool.status}
            </span>
          </div>
          <p>{selectedTool.detail}</p>
          <dl>
            <div>
              <dt>业务输入</dt>
              <dd>{selectedTool.inputSummary}</dd>
            </div>
            <div>
              <dt>结果摘要</dt>
              <dd>{selectedTool.outputSummary ?? '执行中，结果尚未生成'}</dd>
            </div>
            <div className="execution-metrics">
              <span>耗时 {selectedTool.elapsed}</span>
              {selectedTool.resultCount !== undefined ? (
                <span>{selectedTool.resultCount} 条结果</span>
              ) : null}
              {selectedTool.sourceCount !== undefined ? (
                <span>{selectedTool.sourceCount} 个来源</span>
              ) : null}
            </div>
          </dl>
        </article>
      ) : (
        <div className="execution-empty">执行详情暂不可用</div>
      )}
    </div>
  );
}

// 展示已保存的来源片段和外部引用。
function SourcesView({ sources: items }: { sources: SourceView[] }) {
  const evidenceCount = items.filter((source) => source.kind !== 'clue').length;
  return (
    <div className="sources-view">
      <div className="view-toolbar">
        <div>
          <strong>来源</strong>
          <span>
            {evidenceCount === items.length
              ? `${items.length} 个有效引用`
              : `${items.length} 个检索线索`}
          </span>
        </div>
        <button className="icon-button" type="button" aria-label="筛选来源" title="筛选来源">
          <SlidersHorizontal size={16} />
        </button>
      </div>
      <div className="source-list">
        {items.map((source) => (
          <article className="source-item" key={source.id}>
            <div className="source-item-top">
              <span className="source-id">
                {source.kind === 'clue' ? source.id : `[${source.id}]`}
              </span>
              <span className="source-domain">{source.domain}</span>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`打开来源 ${source.title}`}
              >
                <ArrowUpRight size={14} />
              </a>
            </div>
            <h3>{source.title}</h3>
            <p>{source.excerpt}</p>
            <small>
              {source.provider ? `${source.provider} · ` : ''}{source.time} ·{' '}
              {source.kind === 'clue' ? '搜索结果摘要，尚未验证为证据' : '已保存引用片段'}
            </small>
          </article>
        ))}
      </div>
    </div>
  );
}

// 展示报告 Artifact 和确定性的来源列表。
function ReportView({ report, sources: items }: { report: ReportView; sources: SourceView[] }) {
  return (
    <div className="report-view">
      <div className="view-toolbar">
        <div>
          <strong>{report.title}</strong>
          <span>{report.updated}</span>
        </div>
        <button className="secondary-button" type="button">
          <FileText size={15} />
          文件
        </button>
      </div>
      <div className="report-document">
        {report.content}
        <div className="report-sources">
          <h3>来源列表</h3>
          {items.map((source) => (
            <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
              <span className="source-id">[{source.id}]</span>
              {source.title}
              <ArrowUpRight size={13} />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
