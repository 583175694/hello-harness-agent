import type { ActivityStatus, AgentUiState, PreviewState, ProgressItemState, ProgressStatus, RunCardState, SourceView, ToolCallStatus, ToolCallView } from '../model/types';
import { AGENT_UI_COPY } from '../config/ui.constants';

// 开发预览数据与生产状态完全隔离，避免 Mock 逻辑进入 API 流程。
// 开发预览路由允许切换的完整 UI 状态清单，不参与生产数据流。
export const PREVIEW_STATES: Array<{ id: PreviewState; label: string }> = [
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


// 为开发预览状态构造确定性的工具调用列表。
export function makeToolCalls(runId: string, status: ActivityStatus, sourceCount: number): ToolCallView[] {
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
export function makeProgress(status: ActivityStatus): ProgressItemState[] {
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
export function buildRun(
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

// 最终报告与受限报告 fixture 共用的已完成运行基线。
export const completedRun = buildRun('run-market-report', 'completed');
// 为开发预览地址生成隔离的 UI 数据。
export function makeFixture(state: PreviewState): AgentUiState {
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

  if (state === 'empty') return { label: AGENT_UI_COPY.defaultSessionTitle, subtitle: '', conversation: [] };
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
