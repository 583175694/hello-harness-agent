import { Injectable } from '@nestjs/common';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { z } from 'zod';

import type { SearchToolResult } from '@harness/agent-protocol';
import { SearchService } from '../search/search.service';

const webSearchInputSchema = z.object({ query: z.string().trim().min(1).max(500) }).strict();

export type ToolExecutionResult =
  | { ok: true; input: { query: string }; result: SearchToolResult }
  | { ok: false; input?: { query: string }; code: string; detail: string };

@Injectable()
export class ToolRegistryService {
  constructor(private readonly search: SearchService) {}

  definitions(): ChatCompletionTool[] | undefined {
    if (!this.search.isEnabled()) return undefined;
    return [{
      type: 'function',
      function: {
        name: 'web_search',
        description: '搜索公开网页以获取最新或需要来源验证的信息。信息足够后停止搜索并直接回答。',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: { query: { type: 'string', description: '清晰、具体且不重复的搜索词。' } },
          required: ['query'],
        },
      },
    }];
  }

  parseInput(name: string, rawArguments: string): { query: string } {
    if (name !== 'web_search') throw new Error('UNKNOWN_TOOL');
    let value: unknown;
    try {
      value = JSON.parse(rawArguments);
    } catch {
      throw new Error('INVALID_TOOL_ARGUMENTS');
    }
    const parsed = webSearchInputSchema.safeParse(value);
    if (!parsed.success) throw new Error('INVALID_TOOL_ARGUMENTS');
    return parsed.data;
  }

  async execute(name: string, rawArguments: string): Promise<ToolExecutionResult> {
    let input: { query: string };
    try {
      input = this.parseInput(name, rawArguments);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'INVALID_TOOL_ARGUMENTS';
      return {
        ok: false,
        code,
        detail: code === 'UNKNOWN_TOOL' ? '模型请求了未注册的工具。' : '工具参数无效。',
      };
    }
    try {
      return { ok: true, input, result: await this.search.search(input.query) };
    } catch (error) {
      const code = error instanceof Error && error.name === 'TimeoutError'
        ? 'SEARCH_TIMEOUT'
        : 'SEARCH_PROVIDER_FAILED';
      return { ok: false, input, code, detail: '网页搜索暂时不可用。' };
    }
  }
}
