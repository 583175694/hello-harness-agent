import type { AssistantContentBlock, AssistantToolActivityBlock } from '@harness/agent-protocol';

import { AGENT_UI_COPY } from '../config/ui.constants';
import type { ActivityStatus, AgentUiState, PreviewState, SourceView, ToolCallStatus, ToolCallView } from '../model/types';

// 开发预览数据与生产状态完全隔离，避免 Mock 逻辑进入 API 流程。
export const PREVIEW_STATES: Array<{ id: PreviewState; label: string }> = [
  { id: 'empty', label: '空会话' },
  { id: 'direct-answer', label: '直接回答' },
  { id: 'tool-running', label: '检索中（已收起）' },
  { id: 'tool-running-open', label: '首次调用自动打开' },
  { id: 'sources', label: '来源视图' },
  { id: 'fetch-running', label: '读取网页中' },
  { id: 'fetch-candidate', label: '原文候选' },
  { id: 'fetch-failed', label: '读取全部失败' },
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
  { id: 'S1', title: 'Global AI Index 2025', domain: 'tortoisemedia.com', url: 'https://www.tortoisemedia.com/intelligence/global-ai/', excerpt: 'The United States remains the leading country for private AI investment and model development.', time: '刚刚', kind: 'evidence' },
  { id: 'S2', title: 'China AI Development Report', domain: 'cset.georgetown.edu', url: 'https://cset.georgetown.edu/publication/china-ai-development-report/', excerpt: 'China has continued to expand its AI research capacity, talent base, and industrial adoption.', time: '1 分钟前', kind: 'evidence' },
  { id: 'S3', title: 'Stanford AI Index Report', domain: 'hai.stanford.edu', url: 'https://hai.stanford.edu/ai-index', excerpt: 'AI capability and adoption continue to grow while inference costs decline across leading models.', time: '2 分钟前', kind: 'evidence' },
  { id: 'S4', title: 'OECD AI Policy Observatory', domain: 'oecd.ai', url: 'https://oecd.ai/en/', excerpt: 'Policy approaches increasingly focus on transparency, safety, and measurable economic impact.', time: '3 分钟前', kind: 'evidence' },
];

// 创建用于 Fetch 预览的可定位原文候选。
function makeFetchCandidate(): SourceView {
  const text = '企业正在把生成式 AI 从概念验证推进到客服、研发和知识管理等生产场景。';
  return {
    id: 'F1',
    title: '生成式 AI 产业应用观察',
    domain: 'example.com',
    url: 'https://example.com/ai-adoption',
    excerpt: text,
    time: '2026/8/8 10:30:00',
    kind: 'evidence_candidate',
    author: '研究团队',
    publishedAt: '2026-07-28',
    contentType: 'text/html',
    cacheStatus: 'miss',
    passages: [{
      passageId: 'preview-passage-1',
      text,
      locator: {
        kind: 'web_text',
        quote: { exact: text, prefix: '## 产业落地\n\n', suffix: '\n\n企业仍需关注数据治理。' },
        position: { start: 9, end: 9 + Array.from(text).length },
        sectionPath: ['产业落地'],
      },
    }],
  };
}

// 创建 Search -> Fetch 的开发预览，不接入任何生产 API。
function makeFetchFixture(state: 'fetch-running' | 'fetch-candidate' | 'fetch-failed'): AgentUiState {
  const runId = 'run-fetch-preview';
  const running = state === 'fetch-running';
  const failed = state === 'fetch-failed';
  const toolStatus = running ? 'running' as const : 'completed' as const;
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
    outputSummary: failed ? '成功 0 个，失败 2 个，提取 0 段原文' : running ? undefined : '成功 1 个，失败 1 个，提取 1 段原文',
    resultCount: running ? undefined : 2,
    sourceCount: running ? undefined : failed ? 0 : 1,
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
    subtitle: running ? '正在读取 2 个网页' : failed ? '2 个来源读取失败' : '1 个原文候选',
    activeView: state === 'fetch-candidate' ? 'sources' as const : 'activity' as const,
    activityStatus: running ? 'running' as const : 'completed' as const,
    executions: [fetchTool],
    focusTarget: { kind: 'tool_call' as const, runId, stepId: 'fetch-call-1', toolCallId: 'fetch-call-1' },
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

// 为开发预览状态构造确定性的工具调用列表。
export function makeToolCalls(runId: string, status: ActivityStatus, sourceCount: number): ToolCallView[] {
  const currentStatus: ToolCallStatus = status;
  return [
    { toolCallId: `${runId}-tool-1`, runId, stepId: `${runId}-tool-1`, toolName: 'web_search', title: '检索市场趋势', detail: '查找中国生成式 AI 市场的近期概览', status: 'completed', elapsed: '31 秒', inputSummary: '中国生成式 AI 市场趋势 2025', outputSummary: '返回 12 条结果，保留 4 条候选来源', resultCount: 12, sourceCount: 4 },
    { toolCallId: `${runId}-tool-2`, runId, stepId: `${runId}-tool-2`, toolName: 'web_search', title: '检索产业落地案例', detail: '聚焦制造业、消费互联网和政企应用', status: 'completed', elapsed: '38 秒', inputSummary: '中国生成式 AI 产业应用 制造业 政企', outputSummary: '返回 9 条结果，提取 3 个案例', resultCount: 9, sourceCount: 3 },
    { toolCallId: `${runId}-tool-3`, runId, stepId: `${runId}-tool-3`, toolName: 'web_search', title: status === 'waiting' ? '确认检索时间范围' : '交叉验证关键结论', detail: status === 'waiting' ? '时间范围不明确，等待用户确认后继续' : '验证市场规模、增速与产业应用结论', status: currentStatus, elapsed: status === 'completed' ? '44 秒' : '进行中', inputSummary: '中国生成式 AI 市场规模 增速 产业落地', outputSummary: status === 'completed' ? `完成交叉验证，确认 ${sourceCount} 个可用来源` : undefined, resultCount: status === 'completed' ? 8 : undefined, sourceCount: status === 'completed' ? sourceCount : undefined },
  ];
}

// 创建用于展示穿插顺序的文本块。
function text(id: string, content: string): AssistantContentBlock {
  return { id, type: 'text', content };
}

// 创建与工具调用稳定对应的 Activity 内容块。
function activity(runId: string, status: AssistantToolActivityBlock['status']): AssistantContentBlock {
  const summaries = {
    running: '中国生成式 AI 市场规模 增速 产业落地',
    completed: '找到 8 个结果',
    failed: '搜索供应商暂时不可用（503）',
    cancelled: '已停止当前搜索请求',
  } as const;
  return {
    id: `${runId}-activity-3`, type: 'tool_activity', toolCallId: `${runId}-tool-3`, toolName: 'web_search',
    status, title: '搜索网页', summary: summaries[status], startedAt: '2026-08-07T09:00:00.000Z',
    ...(status === 'running' ? {} : { completedAt: '2026-08-07T09:00:44.000Z', durationMs: 44_000 }),
  };
}

// 将预览状态映射为内联工具 Activity 的稳定状态。
function activityStatus(state: PreviewState): AssistantToolActivityBlock['status'] {
  if (state === 'failed') return 'failed';
  if (state === 'cancelled') return 'cancelled';
  if (state === 'final-report' || state === 'limited-report' || state === 'sources') return 'completed';
  return 'running';
}

// 为不同预览状态创建统一 Workbench 外壳数据。
function makeWorkbench(state: PreviewState, runId: string) {
  const status = activityStatus(state);
  const executionStatus: ActivityStatus = state === 'waiting' ? 'waiting' : state === 'cancelling' ? 'cancelling' : status;
  const executions = makeToolCalls(runId, executionStatus, sources.length);
  const reportState = state === 'final-report' || state === 'limited-report';
  const open = state !== 'tool-running';
  return {
    runId,
    title: reportState ? '中国与美国 AI 市场' : '中国 AI 市场调研',
    subtitle: status === 'running' ? '网页检索 · 正在执行' : `网页检索 · ${sources.length} 个来源`,
    activeView: reportState ? 'report' as const : state === 'sources' ? 'sources' as const : 'activity' as const,
    activityStatus: executionStatus,
    executions,
    focusTarget: { kind: 'tool_call' as const, runId, stepId: `${runId}-tool-3`, toolCallId: `${runId}-tool-3` },
    followMode: 'auto' as const,
    sources: state === 'failed' ? sources.slice(0, 1) : sources,
    ...(reportState ? { report: { title: state === 'limited-report' ? '受限报告：证据缺口' : '中国与美国 AI 市场对比', updated: '刚刚更新', content: <><p>美国在前沿模型训练、私人投资和高端算力方面仍然领先 [S1][S3]。</p><p>中国的优势更多体现在制造业、消费互联网和政企场景的规模化应用 [S2]。</p>{state === 'limited-report' ? <p className="report-warning">部分数字缺少可定位原文，暂不作为已确认结论。</p> : null}</> } } : {}),
    open,
  };
}

// 为开发预览地址生成隔离的有序内容块 UI 数据。
export function makeFixture(state: PreviewState): AgentUiState {
  if (state === 'empty') return { label: AGENT_UI_COPY.defaultSessionTitle, subtitle: '', conversation: [] };
  if (state === 'direct-answer') return {
    label: 'AI 趋势概览', subtitle: '', conversation: [
      { id: 'u1', kind: 'user', content: '什么是生成式 AI？' },
      { id: 'a1', kind: 'assistant', blocks: [text('a1-text-1', '生成式 AI 是能够根据输入生成文本、图像、音频或代码等新内容的人工智能系统。')] },
    ],
  };
  if (state === 'fetch-running' || state === 'fetch-candidate' || state === 'fetch-failed') {
    return makeFetchFixture(state);
  }

  const runId = state === 'final-report' || state === 'limited-report' ? 'run-market-report' : 'run-market-live';
  const blocks: AssistantContentBlock[] = [
    text(`${runId}-text-1`, '我先检索近期公开资料，再结合来源给出结论。'),
    activity(runId, activityStatus(state)),
  ];
  if (state === 'sources') blocks.push(text(`${runId}-text-2`, '已获得第一批结果，正在交叉验证关键结论。'));
  if (state === 'waiting') blocks.push(text(`${runId}-text-2`, '检索材料跨度较大，请确认关注近 12 个月还是近 3 年。'));
  if (state === 'steer-accepted') blocks.push(text(`${runId}-text-2`, '已接受调整，接下来会重点补充中国市场的产业应用案例。'));
  if (state === 'cancelling') blocks.push(text(`${runId}-text-2`, '正在安全停止当前检索。'));
  if (state === 'cancelled') blocks.push(text(`${runId}-text-2`, '任务已取消，取消前的来源快照仍保留在工作台中。'));
  if (state === 'failed') blocks.push(text(`${runId}-text-2`, '搜索供应商暂时不可用，当前回答未能完成。'));
  if (state === 'final-report' || state === 'limited-report') blocks.push(text(`${runId}-text-2`, '检索和复核已经完成。美国在前沿模型和私人投资方面领先 [S1][S3]；中国在产业落地方面具备优势 [S2][S4]。'));
  const workbench = makeWorkbench(state, runId);
  return {
    label: state === 'limited-report' ? '受限报告' : '中国 AI 市场调研',
    subtitle: '网页检索任务',
    conversation: [
      { id: 'u1', kind: 'user', content: '请调研中国生成式 AI 市场趋势，重点关注产业落地。' },
      { id: runId, kind: 'assistant', blocks, pending: activityStatus(state) === 'running', workbench },
    ],
    workbench,
    autoOpenSuppressedRunIds: state === 'tool-running' ? [runId] : [],
  };
}
