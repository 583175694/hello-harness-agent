import { Injectable } from '@nestjs/common';
import {
  AGENT_ERROR_CODES,
  AGENT_TOOL_NAMES,
  webFetchInputSchema,
  webFetchResultSchema,
} from '@harness/agent-protocol';
import type { WebFetchInput, WebFetchResult } from '@harness/agent-protocol';
import { WEB_FETCH_POLICY } from '../web-fetch/web-fetch.constants';
import { WebFetchError } from '../web-fetch/web-fetch.error';
import { WebFetchService } from '../web-fetch/web-fetch.service';
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from './agent-tool.types';

@Injectable()
export class WebFetchTool implements AgentTool<WebFetchInput, WebFetchResult> {
  readonly name = AGENT_TOOL_NAMES.webFetch;
  readonly inputSchema = webFetchInputSchema;
  readonly inputErrorCode = AGENT_ERROR_CODES.fetchInputInvalid;
  readonly maxUnitsPerRun = WEB_FETCH_POLICY.maxUrlsPerRun;

  constructor(private readonly webFetch: WebFetchService) {}

  // 返回批量网页读取工具的稳定 Function Calling 声明。
  definition() {
    return {
      name: this.name,
      description: '批量获取并过滤指定 URL 的公开内容，返回与任务相关的可定位原文片段。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          urls: {
            type: 'array',
            minItems: 1,
            maxItems: WEB_FETCH_POLICY.maxUrlsPerCall,
            items: { type: 'string', format: 'uri' },
            description: '需要读取的 1–5 个公开 HTTP/HTTPS 网页地址。',
          },
          query: {
            type: 'string',
            maxLength: 500,
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

  // 返回受控 Evidence Candidate payload，完整正文不会进入模型上下文。
  async execute(
    input: WebFetchInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<WebFetchResult>> {
    const startedAt = Date.now();
    try {
      // 在 SSE 和模型上下文边界再次校验工具结果，阻止脏数据继续传播。
      const output = webFetchResultSchema.parse(await this.webFetch.fetch(input, context.signal));
      const succeeded = output.results.filter((item) => item.status === 'succeeded');
      const passageCount = succeeded.reduce((total, item) => total + item.passages.length, 0);
      return {
        status: 'succeeded',
        output,
        modelContent: JSON.stringify({
          untrustedExternalData: true,
          evidenceQualification: 'evidence_candidate',
          ...output,
        }),
        metrics: {
          durationMs: Date.now() - startedAt,
          resultCount: output.results.length,
          succeededCount: succeeded.length,
          failedCount: output.results.length - succeeded.length,
          passageCount,
        },
      };
    } catch (error) {
      const cancelled = context.signal?.aborted ||
        (error instanceof WebFetchError && error.code === AGENT_ERROR_CODES.fetchCancelled);
      const normalized = error instanceof WebFetchError
        ? error
        : new WebFetchError(AGENT_ERROR_CODES.fetchUpstreamFailed, '网页来源暂时无法读取。', true);
      return {
        status: cancelled ? 'cancelled' : 'failed',
        error: {
          code: normalized.code,
          detail: normalized.message,
          retryable: normalized.retryable,
        },
        modelContent: JSON.stringify({ ok: false, code: normalized.code }),
        metrics: { durationMs: Date.now() - startedAt },
      };
    }
  }

  // 以规范化去重后的 URL 数量计算当前调用消耗的运行级预算。
  units(input: WebFetchInput): number {
    return new Set(input.urls.map((rawUrl) => {
      try {
        const url = new URL(rawUrl);
        url.hash = '';
        return url.toString();
      } catch { return rawUrl; }
    })).size;
  }
}
