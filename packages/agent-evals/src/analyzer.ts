import { assistantAgentMetadataSchema, normalizeSourceUrl } from '@harness/agent-protocol';
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
  const assistant = [...(session?.messages ?? [])]
    .reverse()
    .find((message) => message.role === 'assistant');
  const metadata = assistant
    ? assistantAgentMetadataSchema.safeParse(assistant.metadata)
    : undefined;
  const agent = metadata?.success ? metadata.data.agent : undefined;
  const executions = agent?.executions ?? [];
  const sources = agent?.sources ?? [];
  const answer = assistant?.content ?? '';
  const completed = events.find((event) => event.type === 'message.completed');
  const started = events.filter((event) => event.type === 'tool.started');
  const terminal = events.filter(
    (event) =>
      event.type === 'tool.completed' ||
      event.type === 'tool.failed' ||
      event.type === 'tool.cancelled',
  );
  const searches = started.filter((event) => event.toolName === 'web_search');
  const fetches = started.filter((event) => event.toolName === 'web_fetch');
  const fetchedSources = sources.filter((source) => source.kind === 'fetched');
  const rules: HardRule[] = [];
  const add = (id: string, passed: boolean, detail: string): void => {
    rules.push({ id, passed, detail });
  };

  add(
    'duration',
    durationMs <= testCase.expectations.maxDurationMs,
    `耗时 ${durationMs}ms，上限 ${testCase.expectations.maxDurationMs}ms。`,
  );
  add(
    'message_completed',
    Boolean(completed),
    completed ? '收到 message.completed。' : '缺少 message.completed。',
  );
  add(
    'assistant_persisted',
    Boolean(assistant?.content),
    assistant?.content ? 'assistant 已持久化。' : '未找到持久化 assistant。',
  );
  add(
    'message_identity',
    !completed || completed.messageId === assistant?.id,
    !completed || completed.messageId === assistant?.id
      ? 'SSE 与持久化 assistant ID 一致。'
      : 'SSE 与持久化 assistant ID 不一致。',
  );
  const startedIds = new Set(started.map((event) => event.toolCallId));
  const terminalConsistent =
    startedIds.size === started.length &&
    started.every(
      (item) => terminal.filter((end) => end.toolCallId === item.toolCallId).length === 1,
    ) &&
    terminal.every((item) => startedIds.has(item.toolCallId));
  add(
    'tool_terminal',
    terminalConsistent,
    `开始 ${started.length} 次，终态 ${terminal.length} 次。`,
  );
  const executionIds = new Set(executions.map((execution) => execution.toolCallId));
  const executionConsistent =
    started.every((event) => executionIds.has(event.toolCallId)) &&
    executions.every((execution) =>
      started.some((event) => event.toolCallId === execution.toolCallId),
    );
  add(
    'execution_persistence',
    executionConsistent,
    executionConsistent
      ? 'SSE 工具调用与 execution snapshot 一致。'
      : 'SSE 工具调用与 execution snapshot 不一致。',
  );
  add(
    'tool_call_limit',
    (agent?.toolCallCount ?? started.length) <=
      Math.min(testCase.expectations.maxToolCalls, 20),
    `工具调用 ${agent?.toolCallCount ?? started.length} 次，题目上限 ${Math.min(testCase.expectations.maxToolCalls, 20)} 次。`,
  );
  checkToolExpectation(add, 'tool_use', testCase.expectations.toolUse, started.length, '工具');
  checkToolExpectation(add, 'search_use', testCase.expectations.search, searches.length, '搜索');
  checkToolExpectation(add, 'fetch_use', testCase.expectations.fetch, fetches.length, '读取');
  add(
    'fetched_source_minimum',
    fetchedSources.length >= (testCase.expectations.minFetchedSources ?? 0),
    `已读来源 ${fetchedSources.length} 个，最低要求 ${testCase.expectations.minFetchedSources ?? 0} 个。`,
  );

  const kindsValid = sources.every((source) => source.kind === 'clue' || source.kind === 'fetched');
  add(
    'source_qualification',
    kindsValid,
    kindsValid ? '来源保持 clue/fetched 资格。' : '存在未知来源资格。',
  );
  const unknownProvenance = sources.filter((source) => source.provenance === 'unknown');
  add(
    'source_provenance',
    unknownProvenance.length === 0,
    unknownProvenance.length
      ? `${unknownProvenance.length} 个新来源缺少可还原的 provenance。`
      : '所有新来源均记录了明确 provenance。',
  );
  const canonicalDuplicates = findCanonicalSourceDuplicates(sources);
  add(
    'canonical_sources',
    canonicalDuplicates.length === 0,
    canonicalDuplicates.length
      ? `来源投影仍可归并：${canonicalDuplicates.join(', ')}`
      : '来源投影不存在 URL/hash 重复项。',
  );
  const missingProjectedUrls = findMissingProjectedUrls(events, sources);
  add(
    'source_persistence',
    missingProjectedUrls.length === 0,
    missingProjectedUrls.length
      ? `未持久化来源：${missingProjectedUrls.join(', ')}`
      : '成功工具结果已进入来源投影。',
  );
  const answerUrls = extractUrls(answer);
  const sourceUrls = new Set(
    sources
      .flatMap((source) =>
        source.kind === 'fetched'
          ? [source.requestedUrl, source.finalUrl, source.normalizedUrl]
          : [source.url],
      )
      .map(normalizeSourceUrl),
  );
  const unknownLinks = answerUrls.filter((url) => !sourceUrls.has(normalizeSourceUrl(url)));
  add(
    'answer_links_known',
    unknownLinks.length === 0,
    unknownLinks.length
      ? `回答包含未投影链接：${unknownLinks.join(', ')}`
      : '回答外链均可追到本轮来源。',
  );
  const fetchedUsed = fetchedSources.some(
    (source) => source.used || answer.includes(source.finalUrl),
  );
  add(
    'fetched_preferred',
    !fetchedSources.length || fetchedUsed,
    fetchedSources.length
      ? fetchedUsed
        ? '回答采用了已读来源。'
        : '存在已读来源，但回答未采用。'
      : '本题没有已读来源。',
  );
  const streamFailed = events.find((event) => event.type === 'stream.failed');
  add(
    'provider_failure_explicit',
    !streamFailed,
    streamFailed ? `流失败：${streamFailed.code}` : '没有隐藏的模型流失败。',
  );

  const provider = sources.find((source) => source.kind === 'clue')?.provider;
  const metrics = collectMetrics(events, sources);
  return {
    answer,
    model: completed?.type === 'message.completed' ? completed.model : undefined,
    executions,
    sources,
    provider,
    rules,
    metrics,
  };
}

// 根据 required/forbidden/optional 语义检查某类工具调用次数。
function checkToolExpectation(
  add: (id: string, passed: boolean, detail: string) => void,
  id: string,
  expectation: 'forbidden' | 'required' | 'optional',
  count: number,
  label: string,
): void {
  const passed =
    expectation === 'optional' || (expectation === 'required' ? count > 0 : count === 0);
  add(id, passed, `${label}调用 ${count} 次，预期 ${expectation}。`);
}

// 从单次调用 stats 和持久化来源中提取可横向比较的确定性指标。
export function collectMetrics(
  events: ChatStreamEvent[],
  sources: ResearchSourceSnapshot[],
): EvalCaseMetrics {
  const searchCalls = events.filter(
    (event) => event.type === 'tool.started' && event.toolName === 'web_search',
  ).length;
  const fetchCalls = events.filter(
    (event) => event.type === 'tool.started' && event.toolName === 'web_fetch',
  ).length;
  const fetchCompletions = events.filter(
    (event) => event.type === 'tool.completed' && event.toolName === 'web_fetch',
  );
  const networkAttempts = fetchCompletions.reduce(
    (total, event) => total + event.result.stats.networkAttemptCount,
    0,
  );
  const passageCharacters = fetchCompletions.reduce(
    (total, event) => total + event.result.stats.passageCharacterCount,
    0,
  );
  const fetchedUrls = new Set<string>();
  let duplicateFetchCount = 0;
  for (const event of events) {
    if (event.type !== 'tool.started' || event.toolName !== 'web_fetch') continue;
    for (const url of event.input.urls) {
      const normalized = normalizeSourceUrl(url);
      if (fetchedUrls.has(normalized)) duplicateFetchCount += 1;
      fetchedUrls.add(normalized);
    }
  }
  return {
    searchCalls,
    fetchCalls,
    networkAttempts,
    uniqueDocuments: sources.filter((source) => source.kind === 'fetched').length,
    passageCharacters,
    duplicateFetchCount,
    modelProposedSourceCount: sources.filter(
      (source) => source.kind === 'fetched' && source.provenance === 'model_proposed',
    ).length,
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
  const projected = new Set(
    sources
      .flatMap((source) =>
        source.kind === 'fetched'
          ? [source.requestedUrl, source.finalUrl, source.normalizedUrl]
          : [source.url],
      )
      .map(normalizeSourceUrl),
  );
  const missing: string[] = [];
  for (const event of events) {
    if (event.type === 'tool.completed' && event.toolName === 'web_search') {
      for (const result of event.result.results) {
        if (!projected.has(normalizeSourceUrl(result.url))) missing.push(result.url);
      }
    }
    if (event.type === 'tool.completed' && event.toolName === 'web_fetch') {
      for (const item of event.result.results) {
        if (item.status !== 'succeeded' || !item.passages.length) continue;
        const urlMatched = [item.requestedUrl, item.finalUrl, item.normalizedUrl].some((url) =>
          projected.has(normalizeSourceUrl(url)),
        );
        const hashMatched = sources.some(
          (source) => source.kind === 'fetched' && source.contentHash === item.contentHash,
        );
        if (!urlMatched && !hashMatched) missing.push(item.finalUrl);
      }
    }
  }
  return [...new Set(missing)];
}

// 查找仍可通过 URL 或正文 hash 归并的来源对。
function findCanonicalSourceDuplicates(sources: ResearchSourceSnapshot[]): string[] {
  const duplicates: string[] = [];
  for (let left = 0; left < sources.length; left += 1) {
    for (let right = left + 1; right < sources.length; right += 1) {
      const leftSource = sources[left]!;
      const rightSource = sources[right]!;
      const leftUrls = new Set(
        (leftSource.kind === 'fetched'
          ? [leftSource.requestedUrl, leftSource.finalUrl, leftSource.normalizedUrl]
          : [leftSource.url]
        ).map(normalizeSourceUrl),
      );
      const rightUrls =
        rightSource.kind === 'fetched'
          ? [rightSource.requestedUrl, rightSource.finalUrl, rightSource.normalizedUrl]
          : [rightSource.url];
      const urlMatch = rightUrls.some((url) => leftUrls.has(normalizeSourceUrl(url)));
      const hashMatch =
        leftSource.kind === 'fetched' &&
        rightSource.kind === 'fetched' &&
        leftSource.contentHash === rightSource.contentHash;
      if (urlMatch || hashMatch) duplicates.push(`${leftSource.id}/${rightSource.id}`);
    }
  }
  return duplicates;
}

// 从 Prompt 或 Markdown 回答中提取可公开访问的 HTTP/HTTPS URL。
function extractUrls(content: string): string[] {
  return [...content.matchAll(/https?:\/\/[^\s<>'"\])}]+/giu)].map((match) =>
    match[0].replace(/[.,;:!?，。；：！？]+$/gu, ''),
  );
}

// 对外暴露 metadata 解析，供 Runner 在异常路径复用。
export function parseAgentMetadata(value: unknown): AssistantAgentMetadata | undefined {
  const parsed = assistantAgentMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
