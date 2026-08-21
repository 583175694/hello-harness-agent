import { AGENT_TOOL_NAMES, normalizeSourceUrl } from '@harness/agent-protocol';
import type {
  ResearchSourceSnapshot,
  SearchToolResult,
  SourceProvenance,
  ToolExecutionSnapshot,
  WebFetchInput,
  WebFetchResult,
  WebFetchSourceSnapshot,
} from '@harness/agent-protocol';

type ToolProjectionInput =
  | { toolName: typeof AGENT_TOOL_NAMES.webSearch; input: { query: string } }
  | { toolName: typeof AGENT_TOOL_NAMES.webFetch; input: WebFetchInput }
  | { toolName: typeof AGENT_TOOL_NAMES.approvalTest; input: { message: string } };

const PROVENANCE_PRIORITY: Readonly<Record<SourceProvenance, number>> = {
  // 用户当前消息直接提供的 URL 拥有最高来源优先级。
  user_provided: 3,
  // 搜索工具发现的线索次于用户显式提供的 URL。
  search_clue: 2,
  // 模型自行提出且通过安全校验的 URL 属于模型来源。
  model_proposed: 1,
  // 无法从旧快照还原来源时使用最低优先级。
  unknown: 0,
};

// 收集完整工具执行，并把多次事件派生为稳定的 canonical source 投影。
export class ResearchProjectionCollector {
  private readonly executions: ToolExecutionSnapshot[] = [];
  private readonly sources: ResearchSourceSnapshot[] = [];
  private readonly userProvidedUrls: ReadonlySet<string>;

  constructor(userProvidedUrls: Iterable<string> = []) {
    this.userProvidedUrls = new Set([...userProvidedUrls].map((url) => this.normalizeUrl(url)));
  }

  // 记录一次成功搜索，并把 URL 相同的线索合并到既有 canonical source。
  recordSearchCompleted(input: {
    toolCallId: string;
    query: string;
    completedAt: string;
    durationMs: number;
    result: SearchToolResult;
  }): void {
    this.executions.push({
      toolCallId: input.toolCallId,
      toolName: AGENT_TOOL_NAMES.webSearch,
      input: { query: input.query },
      status: 'completed',
      startedAt: this.startedAt(input.completedAt, input.durationMs),
      completedAt: input.completedAt,
      durationMs: input.durationMs,
      resultCount: input.result.results.length,
    });
    for (const result of input.result.results) {
      const existing = this.findUrlIndexes([result.url])[0];
      if (existing !== undefined) {
        const source = this.sources[existing]!;
        // 后发生的搜索只能补充调用关系，不能倒推此前 Fetch 的 URL 来源。
        this.mergeIdentity(
          source,
          input.toolCallId,
          source.kind === 'clue' ? 'search_clue' : source.provenance,
        );
        continue;
      }
      this.sources.push({
        ...result,
        kind: 'clue',
        used: false,
        provider: input.result.provider,
        provenance: 'search_clue',
        retrievedAt: input.completedAt,
        toolCallIds: [input.toolCallId],
      });
    }
  }

  recordApprovalTestCompleted(input: {
    toolCallId: string;
    toolInput: { message: string };
    completedAt: string;
    durationMs: number;
  }): void {
    this.executions.push({
      toolCallId: input.toolCallId,
      toolName: AGENT_TOOL_NAMES.approvalTest,
      input: input.toolInput,
      status: 'completed',
      startedAt: this.startedAt(input.completedAt, input.durationMs),
      completedAt: input.completedAt,
      durationMs: input.durationMs,
    });
  }

  // 记录一次批量网页读取，并按 URL 或正文 hash 归并来源而不隐藏执行事实。
  recordFetchCompleted(input: {
    toolCallId: string;
    toolInput: WebFetchInput;
    completedAt: string;
    durationMs: number;
    result: WebFetchResult;
  }): void {
    this.executions.push({
      toolCallId: input.toolCallId,
      toolName: AGENT_TOOL_NAMES.webFetch,
      input: input.toolInput,
      status: 'completed',
      startedAt: this.startedAt(input.completedAt, input.durationMs),
      completedAt: input.completedAt,
      durationMs: input.durationMs,
      resultCount: input.result.results.length,
      succeededCount: input.result.stats.succeededCount,
      failedCount: input.result.stats.failedCount,
      skippedCount: input.result.stats.skippedCount,
      passageCount: input.result.stats.passageCount,
      networkAttemptCount: input.result.stats.networkAttemptCount,
      stats: input.result.stats,
    });

    for (const result of input.result.results) {
      if (result.status !== 'succeeded' || !result.passages.length) continue;
      const urls = [result.requestedUrl, result.finalUrl, result.normalizedUrl];
      const urlIndexes = this.findUrlIndexes(urls);
      const hashIndexes = this.findHashIndexes(result.contentHash);
      const collisionIndexes = [...new Set([...urlIndexes, ...hashIndexes])].sort(
        (left, right) => left - right,
      );
      const provenance = this.deriveFetchProvenance(result.requestedUrl, urlIndexes);

      // 仅正文 hash 命中时保留首次来源卡片，只补充调用关系和来源优先级。
      if (!urlIndexes.length && hashIndexes.length) {
        this.mergeIdentity(this.sources[hashIndexes[0]!]!, input.toolCallId, provenance);
        for (const index of hashIndexes.slice(1).reverse())
          this.mergeAndRemove(hashIndexes[0]!, index);
        continue;
      }

      const canonicalIndex = collisionIndexes[0];
      const existing = canonicalIndex === undefined ? undefined : this.sources[canonicalIndex];
      const toolCallIds = [
        ...new Set([
          ...(existing?.toolCallIds ?? []),
          ...collisionIndexes.flatMap((index) => this.sources[index]?.toolCallIds ?? []),
          input.toolCallId,
        ]),
      ];
      const mergedProvenance = collisionIndexes.reduce(
        (current, index) => this.preferredProvenance(current, this.sources[index]!.provenance),
        provenance,
      );
      const candidate: WebFetchSourceSnapshot = {
        kind: 'fetched',
        used: collisionIndexes.some((index) => this.sources[index]?.used),
        id: existing?.id ?? result.contentHash.slice(0, 16),
        provenance: mergedProvenance,
        requestedUrl: result.requestedUrl,
        finalUrl: result.finalUrl,
        normalizedUrl: result.normalizedUrl,
        title: result.title,
        ...(result.author ? { author: result.author } : {}),
        ...(result.publishedAt ? { publishedAt: result.publishedAt } : {}),
        ...(result.language ? { language: result.language } : {}),
        contentType: result.contentType,
        retrievedAt: result.retrievedAt,
        contentHash: result.contentHash,
        cacheStatus: result.cacheStatus,
        truncated: result.truncated,
        passages: result.passages,
        toolCallIds,
      };
      if (canonicalIndex === undefined) this.sources.push(candidate);
      else {
        this.sources[canonicalIndex] = candidate;
        for (const index of collisionIndexes.slice(1).reverse()) this.sources.splice(index, 1);
      }
    }
  }

  // 记录工具失败，让 Activity 在刷新后仍能恢复安全错误摘要。
  recordFailed(
    input: ToolProjectionInput & {
      toolCallId: string;
      completedAt: string;
      durationMs: number;
      code: string;
      detail: string;
      retryable: boolean;
    },
  ): void {
    this.executions.push(this.terminalExecution(input, 'failed'));
  }

  // 记录工具取消，并与普通失败保持不同终态。
  recordCancelled(
    input: ToolProjectionInput & {
      toolCallId: string;
      completedAt: string;
      durationMs: number;
      code: string;
      detail: string;
    },
  ): void {
    this.executions.push(this.terminalExecution(input, 'cancelled'));
  }

  // 返回与 Collector 内部集合隔离的研究投影快照。
  snapshot(): { executions: ToolExecutionSnapshot[]; sources: ResearchSourceSnapshot[] } {
    return { executions: [...this.executions], sources: [...this.sources] };
  }

  // 最终回答完成后，用其中真实出现的 URL 确定性标记轻量 used 状态。
  markUsed(content: string): void {
    const mentionedUrls = this.extractNormalizedUrls(content);
    for (const source of this.sources) {
      source.used = this.sourceUrls(source).some((url) => {
        try {
          return mentionedUrls.has(normalizeSourceUrl(url));
        } catch {
          return content.includes(url);
        }
      });
    }
  }

  // 根据用户直链、既有搜索线索和实际 Fetch 请求派生来源事实。
  private deriveFetchProvenance(requestedUrl: string, urlIndexes: number[]): SourceProvenance {
    if (this.userProvidedUrls.has(this.normalizeUrl(requestedUrl))) return 'user_provided';
    if (urlIndexes.some((index) => this.sources[index]?.kind === 'clue')) return 'search_clue';
    return 'model_proposed';
  }

  // 构造搜索或读取工具的失败/取消执行快照。
  private terminalExecution(
    input: ToolProjectionInput & {
      toolCallId: string;
      completedAt: string;
      durationMs: number;
      code: string;
      detail: string;
      retryable?: boolean;
    },
    status: 'failed' | 'cancelled',
  ): ToolExecutionSnapshot {
    const base = {
      toolCallId: input.toolCallId,
      status,
      startedAt: this.startedAt(input.completedAt, input.durationMs),
      completedAt: input.completedAt,
      durationMs: input.durationMs,
      error: {
        code: input.code,
        detail: input.detail,
        ...(status === 'failed' ? { retryable: input.retryable ?? false } : {}),
      },
    };
    return input.toolName === AGENT_TOOL_NAMES.webFetch
      ? { ...base, toolName: AGENT_TOOL_NAMES.webFetch, input: input.input }
      : input.toolName === AGENT_TOOL_NAMES.approvalTest
        ? { ...base, toolName: AGENT_TOOL_NAMES.approvalTest, input: input.input }
        : { ...base, toolName: AGENT_TOOL_NAMES.webSearch, input: input.input };
  }

  // 返回来源可参与 canonical 匹配的全部 URL。
  private sourceUrls(source: ResearchSourceSnapshot): string[] {
    return source.kind === 'fetched'
      ? [source.requestedUrl, source.finalUrl, source.normalizedUrl]
      : [source.url];
  }

  // 查找与任一输入 URL 等价的全部来源索引。
  private findUrlIndexes(urls: string[]): number[] {
    const targets = new Set(urls.map((url) => this.normalizeUrl(url)));
    return this.sources.flatMap((source, index) =>
      this.sourceUrls(source).some((url) => targets.has(this.normalizeUrl(url))) ? [index] : [],
    );
  }

  // 查找正文 hash 相同的已读取来源索引。
  private findHashIndexes(contentHash: string): number[] {
    return this.sources.flatMap((source, index) =>
      source.kind === 'fetched' && source.contentHash === contentHash ? [index] : [],
    );
  }

  // 合并来源调用关系和 provenance，不改变来源卡片内容。
  private mergeIdentity(
    source: ResearchSourceSnapshot,
    toolCallId: string,
    provenance: SourceProvenance,
  ): void {
    if (!source.toolCallIds.includes(toolCallId)) source.toolCallIds.push(toolCallId);
    source.provenance = this.preferredProvenance(source.provenance, provenance);
  }

  // 将后一来源身份聚合到前一来源并删除后一来源。
  private mergeAndRemove(targetIndex: number, removedIndex: number): void {
    const target = this.sources[targetIndex];
    const removed = this.sources[removedIndex];
    if (!target || !removed || targetIndex === removedIndex) return;
    for (const toolCallId of removed.toolCallIds)
      this.mergeIdentity(target, toolCallId, removed.provenance);
    target.used ||= removed.used;
    this.sources.splice(removedIndex, 1);
  }

  // 按固定优先级返回更可信的 provenance。
  private preferredProvenance(left: SourceProvenance, right: SourceProvenance): SourceProvenance {
    return PROVENANCE_PRIORITY[left] >= PROVENANCE_PRIORITY[right] ? left : right;
  }

  // Markdown 和纯文本回答都可能包含链接；先提取再规范化，避免追踪参数导致误判。
  private extractNormalizedUrls(content: string): Set<string> {
    const urls = new Set<string>();
    for (const match of content.matchAll(/https?:\/\/[^\s<>'"\])}]+/giu)) {
      const rawUrl = match[0].replace(/[.,;:!?，。；：！？]+$/gu, '');
      try {
        urls.add(normalizeSourceUrl(rawUrl));
      } catch {
        /* 忽略模型输出中的损坏链接。 */
      }
    }
    return urls;
  }

  // 根据完成时间和耗时恢复工具开始时间。
  private startedAt(completedAt: string, durationMs: number): string {
    return new Date(new Date(completedAt).getTime() - durationMs).toISOString();
  }

  // 规范化来源 URL，供搜索线索和 Fetch 结果跨工具去重。
  private normalizeUrl(rawUrl: string): string {
    try {
      return normalizeSourceUrl(rawUrl);
    } catch {
      return rawUrl;
    }
  }
}
