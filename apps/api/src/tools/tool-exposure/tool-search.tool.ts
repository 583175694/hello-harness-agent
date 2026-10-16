import { Inject, Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';
import { z } from 'zod';
import {
  AGENT_ERROR_CODES,
  AGENT_TOOL_NAMES,
} from '@harness/agent-protocol';
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from '../agent-tool.types';
import type { McpToolCatalogEntry } from '../../mcp/mcp.types';
import { ToolExposureConfigService } from './tool-exposure.config';
import {
  MCP_ACTIVATED_CAP,
  TOOL_SEARCH_MAX_SCHEMA_CHARS,
} from './tool-exposure.constants';
import type { DeferredToolSearchIndex } from './deferred-tool-search-index';

const toolSearchInputSchema = z.object({
  query: z.string(),
  limit: z.number().int().min(1).max(16).optional(),
});

export type ToolSearchInput = z.infer<typeof toolSearchInputSchema>;

export type ToolSearchResultItem =
  | {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    }
  | {
      name: string;
      description: string;
      truncated: true;
    }
  | {
      name: string;
      description: string;
    };

export type ToolSearchOutput = {
  tools: ToolSearchResultItem[];
  hint: string;
  activatedCandidates: string[];
  fallback?: boolean;
};

export type ToolSearchExecuteOptions = {
  index: DeferredToolSearchIndex | null | undefined;
  activatedTools: ReadonlySet<string> | undefined;
};

@Injectable()
export class ToolSearchTool implements AgentTool<ToolSearchInput, ToolSearchOutput> {
  readonly name = AGENT_TOOL_NAMES.toolSearch;
  readonly inputSchema = toolSearchInputSchema as ZodType<ToolSearchInput>;
  readonly inputErrorCode = AGENT_ERROR_CODES.invalidToolArguments;
  readonly executionPolicy = { timeoutMs: 10_000, approval: 'auto_execute' } as const;

  constructor(@Inject(ToolExposureConfigService) private readonly config: ToolExposureConfigService) {}

  definition() {
    return {
      name: this.name,
      description:
        'Search deferred MCP tools by natural language. Use an English query. Returns matching tool definitions (name, description, parameters). Call a returned tool by its exact name in a follow-up function_call.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 16 },
        },
        required: ['query'],
        additionalProperties: false,
      },
    };
  }

  isAvailable(): boolean {
    return true;
  }

  async execute(
    input: ToolSearchInput,
    _context: ToolExecutionContext,
    options?: ToolSearchExecuteOptions,
  ): Promise<ToolExecutionResult<ToolSearchOutput>> {
    const query = input.query?.trim() ?? '';
    if (!query) {
      return {
        status: 'failed',
        error: {
          code: AGENT_ERROR_CODES.invalidToolArguments,
          detail: 'tool_search requires a non-empty query.',
          retryable: true,
        },
      };
    }
    const index = options?.index;
    if (!index || index.size === 0) {
      return {
        status: 'failed',
        error: {
          code: AGENT_ERROR_CODES.toolUnavailable,
          detail: 'No deferred MCP tools are available to search in this Run.',
          retryable: false,
        },
      };
    }

    const limit = input.limit ?? this.config.toolSearchDefaultLimit;
    const hits = index.search(query, limit);
    const activatedTools = options?.activatedTools ?? new Set<string>();
    const activatedCandidates: string[] = [];
    let remainingActivateSlots = Math.max(0, MCP_ACTIVATED_CAP - activatedTools.size);

    const tools: ToolSearchResultItem[] = [];

    if (!hits.length) {
      const fallback = index.fallbackListing().slice(0, limit);
      for (const item of fallback) {
        tools.push({ name: item.name, description: item.description });
      }
      return {
        status: 'succeeded',
        output: {
          tools,
          hint: 'No strong BM25 match. Try a shorter English query or pick a name from this list.',
          activatedCandidates: [],
          fallback: true,
        },
      };
    }

    for (const hit of hits) {
      const item = materializeSearchResult(hit.entry, remainingActivateSlots, activatedCandidates);
      tools.push(item.result);
      remainingActivateSlots = item.remainingActivateSlots;
    }

    return {
      status: 'succeeded',
      output: {
        tools,
        hint: 'Use function_call with the exact name field.',
        activatedCandidates,
      },
    };
  }
}

function materializeSearchResult(
  entry: McpToolCatalogEntry,
  remainingActivateSlots: number,
  activatedCandidates: string[],
): { result: ToolSearchResultItem; remainingActivateSlots: number } {
  const parametersJson = JSON.stringify(entry.parameters);
  if (parametersJson.length > TOOL_SEARCH_MAX_SCHEMA_CHARS) {
    return {
      result: {
        name: entry.publicName,
        description: entry.description,
        truncated: true,
      },
      remainingActivateSlots,
    };
  }
  if (remainingActivateSlots > 0) {
    activatedCandidates.push(entry.publicName);
    remainingActivateSlots -= 1;
  }
  return {
    result: {
      name: entry.publicName,
      description: entry.description,
      parameters: entry.parameters,
    },
    remainingActivateSlots,
  };
}
