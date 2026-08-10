import {
  AGENT_ERROR_CODES,
  assistantAgentMetadataSchema,
  normalizeSourceUrl,
} from '@harness/agent-protocol';
import type {
  AssistantAgentMetadata,
  ChatStreamEvent,
  ResearchSourceSnapshot,
  SessionDetail,
  ToolExecutionSnapshot,
} from '@harness/agent-protocol';
import type { EvalCaseMetrics, HardRule, ResearchEvalCase } from './types.js';

type Analysis = {
  answer: string;
  model?: string;
  executions: ToolExecutionSnapshot[];
  sources: ResearchSourceSnapshot[];
  provider?: string;
  rules: HardRule[];
  metrics: EvalCaseMetrics;
};

// 根据 SSE 顺序和持久化快照执行不依赖模型的硬规则检查。
export function analyzeCase(
  testCase: ResearchEvalCase,
  events: ChatStreamEvent[],
  session: SessionDetail | undefined,
  durationMs: number,
): Analysis {
  const assistant = [...(session?.messages ?? [])].reverse().find((message) => message.role === 'assistant');
  const metadata = assistant ? assistantAgentMetadataSchema.safeParse(assistant.metadata) : undefined;
  const agent = metadata?.success ? metadata.data.agent : undefined;
  const executions = agent?.executions ?? [];
  const sources = agent?.sources ?? [];
  const answer = assistant?.content ?? '';
  const completed = events.find((event) => event.type === 'message.completed');
  const started = events.filter((event) => event.type === 'tool.started');
  const terminal = events.filter((event) =>
    event.type === 'tool.completed' || event.type === 'tool.failed' || event.type === 'tool.cancelled');
  const searches = started.filter((event) => event.toolName === 'web_search');
  const fetches = started.filter((event) => event.toolName === 'web_fetch');
  const fetchedSources = sources.filter((source) => source.kind === 'fetched');
  const rules: HardRule[] = [];
  const add = (id: string, passed: boolean, detail: string): void => { rules.push({ id, passed, detail }); };

  add('duration', durationMs <= testCase.expectations.maxDurationMs,
    `耗时 ${durationMs}ms，上限 ${testCase.expectations.maxDurationMs}ms。`);
  add('message_completed', Boolean(completed), completed ? '收到 message.completed。' : '缺少 message.completed。');
  add('assistant_persisted', Boolean(assistant?.content), assistant?.content ? 'assistant 已持久化。' : '未找到持久化 assistant。');
  add('message_identity', !completed || completed.messageId === assistant?.id,
    !completed || completed.messageId === assistant?.id ? 'SSE 与持久化 assistant ID 一致。' : 'SSE 与持久化 assistant ID 不一致。');
  const startedIds = new Set(started.map((event) => event.toolCallId));
  const terminalConsistent = startedIds.size === started.length &&
    started.every((item) => terminal.filter((end) => end.toolCallId === item.toolCallId).length === 1) &&
    terminal.every((item) => startedIds.has(item.toolCallId));
  add('tool_terminal', terminalConsistent,
    `开始 ${started.length} 次，终态 ${terminal.length} 次。`);
  const executionIds = new Set(executions.map((execution) => execution.toolCallId));
  const executionConsistent = started.every((event) => executionIds.has(event.toolCallId)) &&
    executions.every((execution) => started.some((event) => event.toolCallId === execution.toolCallId));
  add('execution_persistence', executionConsistent,
    executionConsistent ? 'SSE 工具调用与 execution snapshot 一致。' : 'SSE 工具调用与 execution snapshot 不一致。');
  add('tool_call_limit', started.length <= testCase.expectations.maxToolCalls,
    `工具调用 ${started.length} 次，题目上限 ${testCase.expectations.maxToolCalls} 次。`);
  checkToolExpectation(add, 'tool_use', testCase.expectations.toolUse, started.length, '工具');
  checkToolExpectation(add, 'search_use', testCase.expectations.search, searches.length, '搜索');
  checkToolExpectation(add, 'fetch_use', testCase.expectations.fetch, fetches.length, '读取');
  add('fetched_source_minimum', fetchedSources.length >= (testCase.expectations.minFetchedSources ?? 0),
    `已读来源 ${fetchedSources.length} 个，最低要求 ${testCase.expectations.minFetchedSources ?? 0} 个。`);

  const maxUrlUsed = events.filter((event) => event.type === 'tool.completed' && event.toolName === 'web_fetch')
    .reduce((maximum, event) => Math.max(maximum, event.result.budget.urls.used), 0);
  const maxPassages = events.filter((event) => event.type === 'tool.completed' && event.toolName === 'web_fetch')
    .reduce((maximum, event) => Math.max(maximum, event.result.budget.passages.usedCharacters), 0);
  const startedFetchUrls = new Set(fetches.flatMap((event) => event.toolName === 'web_fetch'
    ? event.input.urls.map(normalizeSourceUrl)
    : []));
  const persistedPassageCharacters = fetchedSources.reduce((total, source) =>
    total + source.passages.reduce((sourceTotal, passage) => sourceTotal + Array.from(passage.text).length, 0), 0);
  const observedUrlCount = Math.max(maxUrlUsed, startedFetchUrls.size);
  const observedPassageCharacters = Math.max(maxPassages, persistedPassageCharacters);
  add('runtime_budgets', observedUrlCount <= 25 && observedPassageCharacters <= 60_000,
    `URL ${observedUrlCount}/25，Passage ${observedPassageCharacters}/60000 字符。`);

  const orderCheck = checkEventOrder(testCase.prompt, events);
  add('fetch_provenance', orderCheck.invalidFetchUrls.length === 0,
    orderCheck.invalidFetchUrls.length ? `未登记 URL：${orderCheck.invalidFetchUrls.join(', ')}` : 'Fetch URL 均来自用户直链或先前 Search clue。');
  add('duplicate_fetch', orderCheck.duplicateFetchUrls.length === 0,
    orderCheck.duplicateFetchUrls.length ? `重复 Fetch：${orderCheck.duplicateFetchUrls.join(', ')}` : '没有重复提交等价 Fetch URL。');
  add('stop_respected', !orderCheck.calledAfterStop,
    orderCheck.calledAfterStop ? '调查停止后仍发起 Search/Fetch。' : '调查停止状态得到遵守。');

  const kindsValid = sources.every((source) => source.kind === 'clue' || source.kind === 'fetched');
  add('source_qualification', kindsValid, kindsValid ? '来源保持 clue/fetched 资格。' : '存在未知来源资格。');
  const missingProjectedUrls = findMissingProjectedUrls(events, sources);
  add('source_persistence', missingProjectedUrls.length === 0,
    missingProjectedUrls.length ? `未持久化来源：${missingProjectedUrls.join(', ')}` : '成功工具结果已进入来源投影。');
  const answerUrls = extractUrls(answer);
  const sourceUrls = new Set(sources.flatMap((source) => source.kind === 'fetched'
    ? [source.requestedUrl, source.finalUrl, source.normalizedUrl]
    : [source.url]).map(normalizeSourceUrl));
  const unknownLinks = answerUrls.filter((url) => !sourceUrls.has(normalizeSourceUrl(url)));
  add('answer_links_known', unknownLinks.length === 0,
    unknownLinks.length ? `回答包含未投影链接：${unknownLinks.join(', ')}` : '回答外链均可追到本轮来源。');
  const fetchedUsed = fetchedSources.some((source) => source.used || answer.includes(source.finalUrl));
  add('fetched_preferred', !fetchedSources.length || fetchedUsed,
    fetchedSources.length ? (fetchedUsed ? '回答采用了已读来源。' : '存在已读来源，但回答未采用。') : '本题没有已读来源。');
  const streamFailed = events.find((event) => event.type === 'stream.failed');
  add('provider_failure_explicit', !streamFailed, streamFailed ? `流失败：${streamFailed.code}` : '没有隐藏的模型流失败。');

  const provider = sources.find((source) => source.kind === 'clue')?.provider;
  const metrics = collectMetrics(events, sources);
  return { answer, model: completed?.type === 'message.completed' ? completed.model : undefined, executions, sources, provider, rules, metrics };
}

// 根据 required/forbidden/optional 语义检查某类工具调用次数。
function checkToolExpectation(
  add: (id: string, passed: boolean, detail: string) => void,
  id: string,
  expectation: 'forbidden' | 'required' | 'optional',
  count: number,
  label: string,
): void {
  const passed = expectation === 'optional' || (expectation === 'required' ? count > 0 : count === 0);
  add(id, passed, `${label}调用 ${count} 次，预期 ${expectation}。`);
}

// 从事件预算快照和持久化来源中提取可横向比较的确定性指标。
export function collectMetrics(
  events: ChatStreamEvent[],
  sources: ResearchSourceSnapshot[],
): EvalCaseMetrics {
  const searchCalls = events.filter((event) => event.type === 'tool.started' && event.toolName === 'web_search').length;
  const fetchCalls = events.filter((event) => event.type === 'tool.started' && event.toolName === 'web_fetch').length;
  const fetchCompletions = events.filter((event) => event.type === 'tool.completed' && event.toolName === 'web_fetch');
  const budgets = fetchCompletions.map((event) => event.result.budget);
  const networkAttempts = Math.max(0, ...budgets.map((budget) => budget.networkAttempts));
  const uniqueDocuments = Math.max(0, ...budgets.map((budget) => budget.successfulUniqueDocuments));
  const passageCharacters = Math.max(0, ...budgets.map((budget) => budget.passages.usedCharacters));
  const stopReason = [...budgets].reverse().find((budget) => budget.stopReason)?.stopReason;
  return {
    searchCalls,
    fetchCalls,
    networkAttempts,
    uniqueDocuments,
    passageCharacters,
    ...(stopReason ? { stopReason } : {}),
    clueSources: sources.filter((source) => source.kind === 'clue').length,
    fetchedSources: sources.filter((source) => source.kind === 'fetched').length,
    usedSources: sources.filter((source) => source.used).length,
  };
}

// 核对成功 Search/Fetch 结果是否以 clue 或 fetched 身份进入持久化来源投影。
function findMissingProjectedUrls(
  events: ChatStreamEvent[],
  sources: ResearchSourceSnapshot[],
): string[] {
  const projected = new Set(sources.flatMap((source) => source.kind === 'fetched'
    ? [source.requestedUrl, source.finalUrl, source.normalizedUrl]
    : [source.url]).map(normalizeSourceUrl));
  const expected: string[] = [];
  for (const event of events) {
    if (event.type === 'tool.completed' && event.toolName === 'web_search') {
      expected.push(...event.result.results.map((result) => result.url));
    }
    if (event.type === 'tool.completed' && event.toolName === 'web_fetch') {
      expected.push(...event.result.results.flatMap((item) =>
        item.status === 'succeeded' && item.passages.length ? [item.finalUrl] : []));
    }
  }
  return [...new Set(expected.filter((url) => !projected.has(normalizeSourceUrl(url))))];
}

// 按真实事件顺序验证 Search clue 授权、Fetch 去重和停止后的调用。
function checkEventOrder(prompt: string, events: ChatStreamEvent[]): {
  invalidFetchUrls: string[];
  duplicateFetchUrls: string[];
  calledAfterStop: boolean;
} {
  const allowed = new Set(extractUrls(prompt).map(normalizeSourceUrl));
  const fetched = new Set<string>();
  const invalidFetchUrls: string[] = [];
  const duplicateFetchUrls: string[] = [];
  let stopped = false;
  let calledAfterStop = false;
  for (const event of events) {
    if (event.type === 'tool.started' && (event.toolName === 'web_search' || event.toolName === 'web_fetch')) {
      if (stopped) calledAfterStop = true;
      if (event.toolName === 'web_fetch') {
        for (const url of event.input.urls) {
          const key = normalizeSourceUrl(url);
          if (!allowed.has(key)) invalidFetchUrls.push(url);
          if (fetched.has(key)) duplicateFetchUrls.push(url);
          fetched.add(key);
        }
      }
    }
    if (event.type === 'tool.completed' && event.toolName === 'web_search') {
      for (const result of event.result.results) allowed.add(normalizeSourceUrl(result.url));
    }
    if (event.type === 'tool.completed' && event.toolName === 'web_fetch' && !event.result.budget.canFetch) stopped = true;
    if (event.type === 'tool.failed' && event.code === AGENT_ERROR_CODES.fetchBudgetExceeded) stopped = true;
  }
  return { invalidFetchUrls: [...new Set(invalidFetchUrls)], duplicateFetchUrls: [...new Set(duplicateFetchUrls)], calledAfterStop };
}

// 从 Prompt 或 Markdown 回答中提取可公开访问的 HTTP/HTTPS URL。
function extractUrls(content: string): string[] {
  return [...content.matchAll(/https?:\/\/[^\s<>'"\])}]+/giu)]
    .map((match) => match[0].replace(/[.,;:!?，。；：！？]+$/gu, ''));
}

// 对外暴露 metadata 解析，供 Runner 在异常路径复用。
export function parseAgentMetadata(value: unknown): AssistantAgentMetadata | undefined {
  const parsed = assistantAgentMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
