import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { AGENT_ERROR_CODES, AGENT_TOOL_NAMES } from '@harness/agent-protocol';
import type { SearchToolResult } from '@harness/agent-protocol';
import { SearchService } from '../search/search.service';
import { SEARCH_LIMITS } from '../search/search.constants';
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from './agent-tool.types';

// 校验模型传入的网页搜索参数，并限制查询长度。
const webSearchInputSchema = z
  .object({ query: z.string().trim().min(1).max(SEARCH_LIMITS.queryMaxLength) })
  .strict();

@Injectable()
export class WebSearchTool implements AgentTool<{ query: string }, SearchToolResult> {
  readonly name = AGENT_TOOL_NAMES.webSearch;
  readonly description =
    '搜索公开网页以获取最新或需要来源验证的信息。信息足够后停止搜索并直接回答。';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    properties: {
      query: {
        type: 'string',
        maxLength: SEARCH_LIMITS.queryMaxLength,
        description: '清晰、具体且不重复的搜索词。',
      },
    },
    required: ['query'],
  };
  readonly inputSchema = webSearchInputSchema;

  constructor(private readonly search: SearchService) {}

  // 返回网页搜索工具的稳定 Function Calling 声明。
  definition() {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
    };
  }

  // 仅当搜索供应商配置完成时向模型开放工具。
  isAvailable(): boolean {
    return this.search.isEnabled();
  }

  // 执行网页搜索，并将供应商错误转换为通用工具结果。
  async execute(
    input: { query: string },
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<SearchToolResult>> {
    const startedAt = Date.now();
    try {
      const output = await this.search.search(input.query, context.signal);
      return {
        status: 'succeeded',
        output,
        modelContent: JSON.stringify({ untrustedExternalData: true, ...output }),
        metrics: { durationMs: Date.now() - startedAt, resultCount: output.results.length },
      };
    } catch (error) {
      // 取消、超时和供应商失败对模型具有不同语义，统一在工具边界转换为稳定错误码。
      const timeout = error instanceof Error && error.name === 'TimeoutError';
      const cancelled = context.signal?.aborted === true;
      const code = cancelled
        ? AGENT_ERROR_CODES.searchCancelled
        : timeout
          ? AGENT_ERROR_CODES.searchTimeout
          : AGENT_ERROR_CODES.searchProviderFailed;
      return {
        status: cancelled ? 'cancelled' : timeout ? 'timeout' : 'failed',
        error: {
          code,
          detail: cancelled ? '网页搜索已取消。' : '网页搜索暂时不可用。',
          retryable: !cancelled,
        },
        modelContent: JSON.stringify({ ok: false, code }),
        metrics: { durationMs: Date.now() - startedAt },
      };
    }
  }
}
