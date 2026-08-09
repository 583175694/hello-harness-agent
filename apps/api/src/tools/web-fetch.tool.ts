import { Injectable } from '@nestjs/common';
import {
  AGENT_ERROR_CODES,
  AGENT_PROTOCOL_LIMITS,
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
  // Tool Registry 用这个稳定名称索引并分派模型发起的网页读取调用。
  readonly name = AGENT_TOOL_NAMES.webFetch;
  // Tool Registry 用共享输入 Schema 校验模型提交的 URL 批次和证据需求。
  readonly inputSchema = webFetchInputSchema;
  // 输入无法通过 Schema 时向 Runtime 返回这个 Web Fetch 专用错误码。
  readonly inputErrorCode = AGENT_ERROR_CODES.fetchInputInvalid;
  // Runtime 用这个上限约束一次 Agent 运行累计读取的去重 URL 数量。
  readonly maxUnitsPerRun = WEB_FETCH_POLICY.maxUrlsPerRun;

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

  // 返回受控 Evidence Candidate payload，完整正文不会进入模型上下文。
  async execute(
    input: WebFetchInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<WebFetchResult>> {
    // 记录工具开始时间，用于计算成功或失败结果的总执行耗时。
    const startedAt = Date.now();
    try {
      // 在 SSE 和模型上下文边界再次校验工具结果，阻止脏数据继续传播。
      const output = webFetchResultSchema.parse(await this.webFetch.fetch(input, context.signal));
      // 只收集逐 URL 成功项，用于生成成功数、失败数和 Passage 数指标。
      const succeeded = output.results.filter((item) => item.status === 'succeeded');
      // 汇总所有成功来源最终返回给模型的原文 Passage 数量。
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
        // URL 对象负责执行标准序列化，使等价地址使用同一个预算键。
        const url = new URL(rawUrl);
        url.hash = '';
        return url.toString();
      } catch { return rawUrl; }
    })).size;
  }
}
