import { Injectable } from '@nestjs/common';
import {
  AGENT_ERROR_CODES,
  AGENT_PROTOCOL_LIMITS,
  AGENT_TOOL_NAMES,
  webFetchInputSchema,
  webFetchResultSchema,
} from '@harness/agent-protocol';
import type { WebFetchInput, WebFetchResult } from '@harness/agent-protocol';
import { WebFetchError } from '../web-fetch/web-fetch.error';
import { WebFetchService } from '../web-fetch/web-fetch.service';
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from './agent-tool.types';

@Injectable()
export class WebFetchTool implements AgentTool<WebFetchInput, WebFetchResult> {
  // Tool Registry 用这个稳定名称索引并分派模型发起的网页读取调用。
  readonly name = AGENT_TOOL_NAMES.webFetch;
  // Tool Registry 用共享输入 Schema 校验模型提交的 URL 批次和证据需求。
  readonly inputSchema = webFetchInputSchema;
  // 输入无法通过 Schema 时向 Runtime 返回这个 Web Fetch 专用错误码。
  readonly inputErrorCode = AGENT_ERROR_CODES.fetchInputInvalid;
  // 核心 Service 负责安全校验、抓取、正文处理和 Passage 选择。
  constructor(private readonly webFetch: WebFetchService) {}

  // 返回批量网页读取工具的稳定 Function Calling 声明。
  definition() {
    return {
      name: AGENT_TOOL_NAMES.webFetch,
      description: '批量获取并过滤指定 URL 的公开内容，返回与任务相关的可定位原文片段。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          urls: {
            type: 'array',
            minItems: 1,
            maxItems: AGENT_PROTOCOL_LIMITS.webFetchUrlsMax,
            items: { type: 'string', format: 'uri' },
            description: '需要读取的 1–5 个公开 HTTP/HTTPS 网页地址。',
          },
          query: {
            type: 'string',
            maxLength: AGENT_PROTOCOL_LIMITS.webFetchQueryMaxLength,
            description: '整批来源共用的证据需求，用于筛选相关原文片段。',
          },
        },
        required: ['urls'],
      },
    };
  }

  // Web Fetch 是本地静态网页能力，不依赖外部搜索 Provider 配置。
  isAvailable(): boolean {
    return true;
  }

  // 返回受控 fetched-source payload，完整正文不会进入模型上下文。
  async execute(
    input: WebFetchInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<WebFetchResult>> {
    // 记录工具开始时间，用于计算成功或失败结果的总执行耗时。
    const startedAt = Date.now();
    try {
      if (context.resources.remainingPassageCharacters() < 2_000) {
        context.resources.markStopped('context_budget');
      }
      const reservations = context.resources.reserveUrls(input.urls);
      const acceptedUrls = reservations
        .filter((item): item is Extract<typeof item, { status: 'accepted' }> => item.status === 'accepted')
        .map((item) => item.requestedUrl);
      const fetched = acceptedUrls.length
        ? await this.webFetch.fetch(
            { urls: acceptedUrls, ...(input.query ? { query: input.query } : {}) },
            context.signal,
            context.resources.remainingPassageCharacters(),
          )
        : { result: { ...(input.query ? { query: input.query } : {}), results: [] }, networkAttempts: 0 };
      context.resources.registerNetworkAttempts(fetched.networkAttempts);
      let acceptedIndex = 0;
      let newDocumentCount = 0;
      const results = reservations.map((reservation) => {
        if (reservation.status === 'skipped') return reservation.result;
        const item = fetched.result.results[acceptedIndex++];
        if (!item) {
          return {
            status: 'failed' as const,
            requestedUrl: reservation.requestedUrl,
            code: AGENT_ERROR_CODES.fetchUpstreamFailed,
            detail: '网页读取未返回结果。',
          };
        }
        if (item.status !== 'succeeded') return item;
        const isNew = context.resources.registerDocument(item);
        if (!isNew) {
          return {
            status: 'skipped' as const,
            requestedUrl: item.requestedUrl,
            code: AGENT_ERROR_CODES.fetchDuplicateSkipped,
            detail: '网页最终地址或正文与本轮已有来源重复。',
          };
        }
        newDocumentCount += 1;
        return item;
      });
      const passageCharacterCount = results
        .filter((item) => item.status === 'succeeded')
        .flatMap((item) => item.passages)
        .reduce((total, passage) => total + Array.from(passage.text).length, 0);
      context.resources.registerPassageCharacters(passageCharacterCount);
      context.resources.registerFetchGain(newDocumentCount);
      const output = webFetchResultSchema.parse({
        ...(input.query ? { query: input.query } : {}),
        results,
        budget: context.resources.budget(),
      });
      // 只收集逐 URL 成功项，用于生成成功数、失败数和 Passage 数指标。
      const succeeded = output.results.filter((item) => item.status === 'succeeded');
      const failed = output.results.filter((item) => item.status === 'failed');
      const skipped = output.results.filter((item) => item.status === 'skipped');
      // 汇总所有成功来源最终返回给模型的原文 Passage 数量。
      const passageCount = succeeded.reduce((total, item) => total + item.passages.length, 0);
      return {
        status: 'succeeded',
        output,
        modelContent: JSON.stringify({
          untrustedExternalData: true,
          sourceQualification: 'fetched',
          ...output,
        }),
        metrics: {
          durationMs: Date.now() - startedAt,
          resultCount: output.results.length,
          succeededCount: succeeded.length,
          failedCount: failed.length,
          skippedCount: skipped.length,
          passageCount,
          passageCharacterCount,
          networkAttemptCount: fetched.networkAttempts,
          successfulUniqueDocumentCount: newDocumentCount,
          urlUsedCount: output.budget.urls.used,
          urlRemainingCount: output.budget.urls.remaining,
          stopReason: output.budget.stopReason,
        },
        ...(!output.budget.canFetch
          ? { control: { disableTools: [AGENT_TOOL_NAMES.webSearch, AGENT_TOOL_NAMES.webFetch], forceFinalAnswer: true } }
          : {}),
      };
    } catch (error) {
      // 调用方中止或核心 Service 返回取消错误时，将工具终态标记为 cancelled。
      const cancelled = context.signal?.aborted ||
        (error instanceof WebFetchError && error.code === AGENT_ERROR_CODES.fetchCancelled);
      // 保留已归一化的 Web Fetch 错误，并把未知异常收敛为安全的上游失败。
      const normalized = error instanceof WebFetchError
        ? error
        : new WebFetchError(AGENT_ERROR_CODES.fetchUpstreamFailed, '网页来源暂时无法读取。', true);
      return {
        status: cancelled ? 'cancelled' : 'failed',
        error: {
          code: normalized.code,
          detail: normalized.message,
          retryable: normalized.retryable,
          cause: error,
        },
        modelContent: JSON.stringify({ ok: false, code: normalized.code }),
        metrics: { durationMs: Date.now() - startedAt },
      };
    }
  }

}
