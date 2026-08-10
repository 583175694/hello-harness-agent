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
import { getWebResearchRunState } from './web-research-run-state';

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
    try {
      const research = getWebResearchRunState(context);
      if (research.remainingPassageCharacters() < 2_000) {
        research.markStopped('context_budget');
      }
      const reservations = research.reserveUrls(input.urls);
      const acceptedUrls = reservations
        .filter(
          (item): item is Extract<typeof item, { status: 'accepted' }> =>
            item.status === 'accepted',
        )
        .map((item) => item.requestedUrl);
      const fetched = acceptedUrls.length
        ? await this.webFetch.fetch(
            { urls: acceptedUrls, ...(input.query ? { query: input.query } : {}) },
            context.signal,
            research.remainingPassageCharacters(),
          )
        : {
            result: { ...(input.query ? { query: input.query } : {}), results: [] },
            networkAttempts: 0,
          };
      research.registerNetworkAttempts(fetched.networkAttempts);
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
        const isNew = research.registerDocument(item);
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
      research.registerPassageCharacters(passageCharacterCount);
      research.registerFetchGain(newDocumentCount);
      const output = webFetchResultSchema.parse({
        ...(input.query ? { query: input.query } : {}),
        results,
        budget: research.budget(),
      });
      // 跳过数量与预算快照一起作为工具声明的通用日志字段。
      const skipped = output.results.filter((item) => item.status === 'skipped');
      return {
        status: 'succeeded',
        output,
        modelContent: JSON.stringify({
          untrustedExternalData: true,
          sourceQualification: 'fetched',
          ...output,
        }),
        logFields: {
          结果: output.results.length,
          URL: `${output.budget.urls.used}/${output.budget.urls.limit}`,
          网络请求: fetched.networkAttempts,
          唯一文档: newDocumentCount,
          跳过: skipped.length,
          Passage: `${passageCharacterCount} 字`,
          停止: output.budget.stopReason ?? '否',
        },
        ...(!output.budget.canFetch ? { control: { forceFinalAnswer: true } } : {}),
      };
    } catch (error) {
      // 调用方中止或核心 Service 返回取消错误时，将工具终态标记为 cancelled。
      const cancelled =
        context.signal?.aborted ||
        (error instanceof WebFetchError && error.code === AGENT_ERROR_CODES.fetchCancelled);
      // 保留已归一化的 Web Fetch 错误，并把未知异常收敛为安全的上游失败。
      const normalized =
        error instanceof WebFetchError
          ? error
          : new WebFetchError(
              AGENT_ERROR_CODES.fetchUpstreamFailed,
              '网页来源暂时无法读取。',
              true,
            );
      return {
        status: cancelled ? 'cancelled' : 'failed',
        error: {
          code: normalized.code,
          detail: normalized.message,
          retryable: normalized.retryable,
          cause: error,
        },
        modelContent: JSON.stringify({ ok: false, code: normalized.code }),
      };
    }
  }
}
