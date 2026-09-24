import {
  assistantAgentMetadataSchema,
  assistantContentBlockSchema,
  normalizeSourceUrl,
} from "@harness/agent-protocol";
import type {
  AssistantArtifactBlock,
  AssistantContentBlock,
  BashTerminalView,
  PersistedMessage,
  PendingUserInputView,
  SourceProvenance,
} from "@harness/agent-protocol";
import type { ToolStreamEvent } from "@harness/agent-client";
import {
  bashTerminalFromInput,
  cloneAssistantBlocks,
  mergeBashTerminalView,
  nextSourceNumber,
  fetchProvenance,
  liveCompletedDetail,
  liveOutputSummary,
  liveToolCounts,
  persistedActiveView,
  persistedActivityStatus,
  persistedOutputSummary,
  persistedToolDetail,
  toolEventStatus,
  toolInputSummary,
  toolRunningDetail,
  toolTitle,
} from "@harness/agent-conversation";
import type { ConversationItem, SourceView, ToolCallView, WorkbenchState } from "@harness/agent-ui-types";

const SEARCH_WORKBENCH_TITLE = "网页检索";

// 将工具耗时格式化为适合 Workbench 展示的短文本。
function formatToolDuration(durationMs: number): string {
  return durationMs < 1000 ? `${durationMs} 毫秒` : `${(durationMs / 1000).toFixed(1)} 秒`;
}

// 从任意网页地址读取适合 Workbench 展示的域名。
function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// 安全规范化来源 URL，损坏地址保留原值以避免实时投影中断。
function canonicalUrl(url: string): string {
  try {
    return normalizeSourceUrl(url);
  } catch {
    return url;
  }
}

// 返回来源可参与实时 canonical merge 的全部 URL。
function sourceViewUrls(source: SourceView): string[] {
  return [source.url, source.requestedUrl, source.normalizedUrl].filter((url): url is string =>
    Boolean(url),
  );
}

// 按固定优先级合并来源 provenance。
function preferredProvenance(
  left: SourceProvenance | undefined,
  right: SourceProvenance,
): SourceProvenance {
  const priority = { user_provided: 3, search_clue: 2, model_proposed: 1, unknown: 0 };
  return left && priority[left] >= priority[right] ? left : right;
}

function workbenchHeader(executions: ReadonlyArray<{ toolName: string }>, sourceCount: number) {
  // 根据当前调用集合选择 Workbench 标题和摘要。
  const isFileTool = (toolName: string) =>
    toolName === 'search_file' || toolName === 'read_file_lines';
  const isWebTool = (toolName: string) => toolName === 'web_search' || toolName === 'web_fetch';
  if (executions.length > 0 && executions.every((item) => isFileTool(item.toolName))) {
    return { title: '文件读取', subtitle: `${executions.length} 次文件调用` };
  }
  if (executions.length > 0 && executions.every((item) => isWebTool(item.toolName))) {
    return {
      title: SEARCH_WORKBENCH_TITLE,
      subtitle: `${executions.length} 次调用 · ${sourceCount} 个来源`,
    };
  }
  return {
    title: '工具执行',
    subtitle: sourceCount
      ? `${executions.length} 次调用 · ${sourceCount} 个来源`
      : `${executions.length} 次调用`,
  };
}

// 将持久化 assistant metadata 投影为可恢复的轻量 Workbench。
export function workbenchFromPersistedMessage(
  message: PersistedMessage,
): WorkbenchState | undefined {
  // 从已持久化的 assistant metadata 恢复文件工具和来源投影。
  if (message.role !== 'assistant') return undefined;
  const metadata = assistantAgentMetadataSchema.safeParse(message.metadata);
  if (!metadata.success) return undefined;
  const executions = metadata.data.agent?.executions ?? [];
  const sources = metadata.data.agent?.sources ?? [];
  const context = metadata.data.context;
  const contentBlocks = metadata.data.blocks ?? [];
  const artifactBlocks = contentBlocks.filter(
    (block): block is AssistantArtifactBlock => block.type === 'artifact',
  );
  const bashTerminalByCallId = new Map<string, BashTerminalView>();
  for (const block of contentBlocks) {
    if (block.type === 'tool_activity' && block.toolName === 'bash' && block.terminalView) {
      bashTerminalByCallId.set(block.toolCallId, block.terminalView);
    }
  }
  if (!executions.length && !context && !metadata.data.plan && !artifactBlocks.length)
    return undefined;
  const completedCount = executions.filter((execution) => execution.status === 'completed').length;
  const cancelledCount = executions.filter((execution) => execution.status === 'cancelled').length;
  let clueIndex = 0;
  let candidateIndex = 0;
  const sourceViews = sources.map((source) => {
    if (source.kind === 'fetched') {
      candidateIndex += 1;
      return {
        id: `F${candidateIndex}`,
        title: source.title,
        domain: sourceDomain(source.finalUrl),
        url: source.finalUrl,
        excerpt: source.passages[0]?.text ?? '已读取网页，但没有匹配当前问题的原文片段。',
        time: new Date(source.retrievedAt).toLocaleString('zh-CN'),
        kind: 'fetched' as const,
        used: source.used,
        author: source.author,
        publishedAt: source.publishedAt,
        contentType: source.contentType,
        cacheStatus: source.cacheStatus,
        truncated: source.truncated,
        passages: source.passages,
        provenance: source.provenance,
        requestedUrl: source.requestedUrl,
        normalizedUrl: source.normalizedUrl,
        contentHash: source.contentHash,
        toolCallIds: source.toolCallIds,
      };
    }
    clueIndex += 1;
    return {
      id: `R${clueIndex}`,
      title: source.title,
      domain: source.domain,
      url: source.url,
      excerpt: source.snippet,
      time: new Date(source.retrievedAt).toLocaleString('zh-CN'),
      provider: source.provider,
      kind: 'clue' as const,
      used: source.used,
      provenance: source.provenance,
      toolCallIds: source.toolCallIds,
    };
  });
  const header = workbenchHeader(executions, sourceViews.length);
  const artifacts = artifactBlocks.map((block) => ({
    artifactId: block.artifactId,
    fileId: block.fileId,
    fileName: block.fileName,
    mediaType: block.mediaType,
    fileKind: block.fileKind,
    size: block.size,
    status: block.status,
    createdAt: block.createdAt,
    ...(block.errorCode ? { errorCode: block.errorCode } : {}),
    ...(block.lineCount !== undefined ? { lineCount: block.lineCount } : {}),
    ...(block.characterCount !== undefined ? { characterCount: block.characterCount } : {}),
  }));
  return {
    runId: message.runId ?? message.id,
    title: context && !executions.length ? 'Context 调试' : header.title,
    subtitle:
      context && !executions.length ? `Model Round ${context.roundSequence}` : header.subtitle,
    activeView: persistedActiveView(sources.length, Boolean(context && !executions.length)),
    activityStatus: persistedActivityStatus(completedCount, cancelledCount, executions.length),
    executions: executions.map((execution) => {
      const input = execution.input;
      const terminal =
        execution.toolName === 'bash'
          ? mergeBashTerminalView(
              bashTerminalFromInput(input),
              bashTerminalByCallId.get(execution.toolCallId),
            )
          : undefined;
      return {
        toolCallId: execution.toolCallId,
        runId: message.runId ?? message.id,
        stepId: execution.toolCallId,
        toolName: execution.toolName,
        title: toolTitle(execution.toolName, input),
        detail: persistedToolDetail(execution.status, execution.toolName),
        status: execution.status,
        elapsed: formatToolDuration(execution.durationMs),
        inputSummary: toolInputSummary(execution.toolName, input),
        ...(terminal ? { terminal } : {}),
        outputSummary: persistedOutputSummary({
          status: execution.status,
          toolName: execution.toolName,
          fileName: 'fileName' in input ? input.fileName : undefined,
          title: 'title' in input ? input.title : undefined,
          succeededCount: execution.succeededCount,
          failedCount: execution.failedCount,
          passageCount: execution.passageCount,
          resultCount: execution.resultCount,
          errorDetail: execution.error?.detail,
        }),
        resultCount: execution.resultCount,
        sourceCount:
          execution.toolName === 'web_fetch' ? execution.succeededCount : execution.resultCount,
      };
    }),
    followMode: 'auto',
    sources: sourceViews,
    ...(artifacts.length ? { artifacts } : {}),
    ...(context ? { context } : {}),
    ...(metadata.data.plan ? { plan: metadata.data.plan } : {}),
    open: Boolean((context || metadata.data.plan) && !executions.length),
  };
}

// 将实时工具生命周期事件增量投影到当前 Workbench 状态。
export function applyToolEvent(
  current: WorkbenchState | undefined,
  event: ToolStreamEvent,
  open: boolean,
  currentUserUrls: ReadonlySet<string> = new Set(),
): WorkbenchState {
  // 将实时工具事件归约为当前会话的 Workbench 状态。
  const base: WorkbenchState = current ?? {
    runId: event.messageId,
    title: SEARCH_WORKBENCH_TITLE,
    subtitle: '正在搜索公开网页',
    activeView: 'activity',
    activityStatus: 'running',
    executions: [],
    followMode: 'auto',
    sources: [],
    open,
  };
  if (event.type === 'tool.started') {
    const bashTerminal =
      event.toolName === 'bash'
        ? mergeBashTerminalView(
            bashTerminalFromInput(event.input),
            'terminalView' in event ? event.terminalView : undefined,
          )
        : undefined;
    const tool: ToolCallView = {
      toolCallId: event.toolCallId,
      runId: event.messageId,
      stepId: event.toolCallId,
      toolName: event.toolName,
      title: toolTitle(event.toolName, event.input),
      detail: toolRunningDetail(event.toolName),
      status: 'running',
      elapsed: '进行中',
      inputSummary: toolInputSummary(event.toolName, event.input),
      ...(bashTerminal ? { terminal: bashTerminal } : {}),
    };
    const executions = base.executions.some((item) => item.toolCallId === event.toolCallId)
      ? base.executions
      : [...base.executions, tool];
    const header = workbenchHeader(executions, base.sources.length);
    return {
      ...base,
      open,
      title: header.title,
      subtitle: header.subtitle,
      activityStatus: 'running',
      executions,
      focusTarget: {
        kind: 'tool_call',
        runId: event.messageId,
        stepId: event.toolCallId,
        toolCallId: event.toolCallId,
      },
    };
  }

  const completedEvent = event.type === 'tool.completed' ? event : undefined;
  const failedEvent = event.type === 'tool.failed' ? event : undefined;
  const cancelledEvent = event.type === 'tool.cancelled' ? event : undefined;
  const status = toolEventStatus(event.type);
  const completedFetch = completedEvent?.toolName === 'web_fetch' ? completedEvent : undefined;
  const completedApproval =
    completedEvent?.toolName === 'approval_test' ? completedEvent : undefined;
  const completedFileSearch =
    completedEvent?.toolName === 'search_file' ? completedEvent : undefined;
  const completedFileReadLines =
    completedEvent?.toolName === 'read_file_lines' ? completedEvent : undefined;
  const completedCreateFile =
    completedEvent?.toolName === 'create_file' ? completedEvent : undefined;
  const completedCreateReport =
    completedEvent?.toolName === 'create_report' ? completedEvent : undefined;
  const fetchSucceeded =
    completedFetch?.result.results.filter((item) => item.status === 'succeeded') ?? [];
  const resultCount = liveToolCounts(
    completedEvent,
    completedFileSearch,
    completedFileReadLines,
  );
  const sourceCount = completedFetch ? fetchSucceeded.length : resultCount;
  const executions = base.executions.map((tool) =>
    tool.toolCallId === event.toolCallId
      ? {
          ...tool,
          status,
          detail: completedEvent
            ? liveCompletedDetail(completedEvent.toolName)
            : (cancelledEvent?.detail ?? failedEvent?.detail ?? '工具执行失败'),
          elapsed: formatToolDuration(event.durationMs),
          ...(completedEvent?.toolName === 'bash'
            ? {
                terminal: mergeBashTerminalView(
                  tool.terminal,
                  'terminalView' in completedEvent ? completedEvent.terminalView : undefined,
                ),
              }
            : {}),
          outputSummary: completedEvent
            ? liveOutputSummary({
                toolName: completedEvent.toolName,
                fetchStats: completedFetch?.result.stats,
                approvalEcho: completedApproval?.result.echoed,
                fileSearchCount: completedFileSearch?.result.matches.length,
                fileReadLineCount: completedFileReadLines?.result.lines.length,
                fileName: completedCreateFile?.result.file.fileName,
                reportTitle: completedCreateReport?.result.report.title,
                searchResultCount:
                  completedEvent.toolName === 'web_search'
                    ? completedEvent.result.results.length
                    : 0,
              })
            : (cancelledEvent?.detail ?? failedEvent?.detail),
          resultCount,
          sourceCount,
        }
      : tool,
  );
  const sources = [...base.sources];
  if (event.type === 'tool.completed' && event.toolName === 'web_search') {
    let clueNumber = nextSourceNumber(base.sources, 'R');
    for (const source of event.result.results) {
      const sourceKey = canonicalUrl(source.url);
      const existing = sources.find((item) =>
        sourceViewUrls(item).some((url) => canonicalUrl(url) === sourceKey),
      );
      if (existing) {
        existing.toolCallIds = [...new Set([...(existing.toolCallIds ?? []), event.toolCallId])];
        if (existing.kind === 'clue')
          existing.provenance = preferredProvenance(existing.provenance, 'search_clue');
      } else {
        sources.push({
          id: `R${clueNumber}`,
          title: source.title,
          domain: source.domain,
          url: source.url,
          excerpt: source.snippet,
          time: new Date(event.completedAt).toLocaleString('zh-CN'),
          provider: event.result.provider,
          kind: 'clue',
          provenance: 'search_clue',
          toolCallIds: [event.toolCallId],
        });
        clueNumber += 1;
      }
    }
  }
  if (event.type === 'tool.completed' && event.toolName === 'web_fetch') {
    let candidateNumber = nextSourceNumber(base.sources, 'F');
    for (const source of event.result.results) {
      if (source.status !== 'succeeded' || !source.passages.length) continue;
      const resultUrls = new Set(
        [source.requestedUrl, source.finalUrl, source.normalizedUrl].map(canonicalUrl),
      );
      const urlIndexes = sources.flatMap((item, index) =>
        sourceViewUrls(item).some((url) => resultUrls.has(canonicalUrl(url))) ? [index] : [],
      );
      const hashIndexes = sources.flatMap((item, index) =>
        item.contentHash === source.contentHash ? [index] : [],
      );
      const collisions = [...new Set([...urlIndexes, ...hashIndexes])].sort((a, b) => a - b);
      const requestedKey = canonicalUrl(source.requestedUrl);
      const provenance = fetchProvenance(
        currentUserUrls.has(requestedKey),
        urlIndexes.some((index) => sources[index]?.kind === 'clue'),
      );
      // 仅 hash 相同但 URL 不同的来源保留首次卡片，只聚合执行身份。
      if (!urlIndexes.length && hashIndexes.length) {
        const target = sources[hashIndexes[0]!];
        if (target) {
          target.toolCallIds = [
            ...new Set([
              ...(target.toolCallIds ?? []),
              ...hashIndexes.flatMap((index) => sources[index]?.toolCallIds ?? []),
              event.toolCallId,
            ]),
          ];
          target.provenance = hashIndexes.reduce(
            (value, index) => preferredProvenance(value, sources[index]?.provenance ?? 'unknown'),
            preferredProvenance(target.provenance, provenance),
          );
        }
        for (const index of hashIndexes.slice(1).reverse()) sources.splice(index, 1);
        continue;
      }
      const existing = collisions[0] === undefined ? undefined : sources[collisions[0]];
      const candidateId = existing?.kind === 'fetched' ? existing.id : `F${candidateNumber++}`;
      const mergedToolCallIds = [
        ...new Set([
          ...(existing?.toolCallIds ?? []),
          ...collisions.flatMap((index) => sources[index]?.toolCallIds ?? []),
          event.toolCallId,
        ]),
      ];
      const mergedProvenance = collisions.reduce(
        (value, index) => preferredProvenance(value, sources[index]?.provenance ?? 'unknown'),
        provenance as SourceProvenance,
      );
      const candidate: SourceView = {
        id: candidateId,
        title: source.title,
        domain: sourceDomain(source.finalUrl),
        url: source.finalUrl,
        excerpt: source.passages[0]?.text ?? '',
        time: new Date(source.retrievedAt).toLocaleString('zh-CN'),
        kind: 'fetched',
        used: false,
        author: source.author,
        publishedAt: source.publishedAt,
        contentType: source.contentType,
        cacheStatus: source.cacheStatus,
        truncated: source.truncated,
        passages: source.passages,
        provenance: mergedProvenance,
        requestedUrl: source.requestedUrl,
        normalizedUrl: source.normalizedUrl,
        contentHash: source.contentHash,
        toolCallIds: mergedToolCallIds,
      };
      if (collisions[0] === undefined) sources.push(candidate);
      else {
        sources[collisions[0]] = candidate;
        for (const index of collisions.slice(1).reverse()) sources.splice(index, 1);
      }
    }
  }
  const header = workbenchHeader(executions, sources.length);
  const completedArtifact = completedCreateFile ?? completedCreateReport;
  const artifacts =
    completedArtifact &&
    !(base.artifacts ?? []).some(
      (item) => item.artifactId === completedArtifact.result.artifact.artifactId,
    )
      ? [...(base.artifacts ?? []), completedArtifact.result.artifact]
      : base.artifacts;
  return {
    ...base,
    open,
    title: header.title,
    activityStatus: cancelledEvent ? 'cancelled' : base.activityStatus,
    subtitle: header.subtitle,
    activeView: completedArtifact
      ? 'artifact'
      : event.type === 'tool.completed' && sources.length
        ? 'sources'
        : base.activeView,
    executions,
    sources,
    ...(completedArtifact
      ? {
          focusTarget: {
            kind: 'artifact' as const,
            runId: base.runId,
            artifactId: completedArtifact.result.artifact.artifactId,
          },
        }
      : {}),
    ...(artifacts?.length ? { artifacts } : {}),
  };
}

// 将持久化消息转换为 Conversation 可直接渲染的项目。
export function toConversationItem(message: PersistedMessage): ConversationItem {
  // 将后端消息转换为会话区域使用的用户或 assistant 项目。
  if (message.role === 'user')
    return {
      id: message.id,
      kind: 'user',
      content: message.content,
      ...(typeof message.metadata?.pendingInputId === 'string'
        ? { pendingInputId: message.metadata.pendingInputId }
        : {}),
      attachments: message.attachments,
      createdAt: message.createdAt,
    };
  const metadata =
    typeof message.metadata === 'object' && message.metadata !== null
      ? (message.metadata as Record<string, unknown>)
      : {};
  const blocksValue = metadata.blocks;
  const blocks = Array.isArray(blocksValue)
    ? blocksValue.flatMap((value): AssistantContentBlock[] => {
        // 兼容早期 Steer 持久化 bug：事件名被误写成内容块类型。
        const candidate =
          typeof value === 'object' && value !== null && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : value;
        const normalized =
          typeof candidate === 'object' &&
          candidate !== null &&
          !Array.isArray(candidate) &&
          candidate.type === 'user.intervention'
            ? { ...candidate, type: 'user_intervention' }
            : candidate;
        const parsed = assistantContentBlockSchema.safeParse(normalized);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
  const restoredBlocks = blocks.length ? cloneAssistantBlocks(blocks) : [];
  const errorValue = metadata.error;
  const persistedError: { code: string; detail: string } | undefined =
    typeof errorValue === 'object' &&
    errorValue !== null &&
    !Array.isArray(errorValue) &&
    typeof (errorValue as Record<string, unknown>).code === 'string' &&
    typeof (errorValue as Record<string, unknown>).detail === 'string'
      ? {
          code: (errorValue as { code: string; detail: string }).code,
          detail: (errorValue as { code: string; detail: string }).detail,
        }
      : undefined;
  const finalBlocks = restoredBlocks.length
    ? restoredBlocks
    : [{ id: `${message.id}-text-1`, type: 'text' as const, content: message.content }];
  return {
    id: message.id,
    kind: 'assistant',
    blocks: finalBlocks,
    ...(message.deliveryStatus ? { deliveryStatus: message.deliveryStatus } : {}),
    ...(persistedError ? { error: persistedError } : {}),
    createdAt: message.createdAt,
    workbench: workbenchFromPersistedMessage(message),
  };
}


function pendingStateForInput(
  input: PendingUserInputView | undefined,
): 'steer_pending' | 'steer_applied' | 'follow_up_pending' | undefined {
  if (!input) return undefined;
  if (input.kind === 'steer' && input.status === 'consumed') return 'steer_applied';
  if (input.kind === 'steer') return 'steer_pending';
  if (input.status === 'consumed') return 'follow_up_pending';
  return 'follow_up_pending';
}

export function mergePendingSteerState(
  conversation: ConversationItem[],
  pendingInputs: PendingUserInputView[],
): ConversationItem[] {
  return conversation.map((item) => {
    if (item.kind !== 'user' || !item.pendingInputId) return item;
    const pending = pendingInputs.find((input) => input.id === item.pendingInputId);
    return { ...item, pendingState: pendingStateForInput(pending) };
  });
}

export function uniquePendingInputs(items: PendingUserInputView[]): PendingUserInputView[] {
  // 合并重复的 Pending Input，并按服务端序号恢复稳定顺序。
  const merged = new Map<string, PendingUserInputView>();
  for (const item of items) {
    const previous = merged.get(item.id);
    // 延迟到达的全量列表不能把已提升的 Steer 回滚成 Follow-up。
    if (!previous || item.kind === 'steer' || previous.status !== 'pending')
      merged.set(item.id, item);
  }
  return [...merged.values()].sort((left, right) => left.sequence - right.sequence);
}

export function preferRicherAssistant(
  current: ConversationItem | undefined,
  restored: ConversationItem,
): ConversationItem {
  if (
    current?.kind === 'assistant' &&
    restored.kind === 'assistant' &&
    current.blocks.length > restored.blocks.length
  ) {
    return {
      ...restored,
      blocks: current.blocks,
      workbench: current.workbench ?? restored.workbench,
    };
  }
  return restored;
}
