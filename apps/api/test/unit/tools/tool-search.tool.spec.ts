import { describe, expect, it } from 'vitest';

import { ToolSearchTool } from '../../../src/tools/tool-exposure/tool-search.tool';
import { ToolExposureConfigService } from '../../../src/tools/tool-exposure/tool-exposure.config';
import { DeferredToolSearchIndex } from '../../../src/tools/tool-exposure/deferred-tool-search-index';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import type { ConfigService } from '@nestjs/config';
import type { McpToolCatalogEntry } from '../../../src/mcp/mcp.types';
import { TOOL_SEARCH_MAX_SCHEMA_CHARS } from '../../../src/tools/tool-exposure/tool-exposure.constants';

function configService(): ConfigService {
  return { get: () => undefined } as unknown as ConfigService;
}

function entry(overrides: Partial<McpToolCatalogEntry> = {}): McpToolCatalogEntry {
  return {
    publicName: 'mcp__demo__ping',
    serverName: 'demo',
    rawName: 'ping',
    description: 'Ping demo service',
    parameters: { type: 'object', properties: { message: { type: 'string' } } },
    defaultApproval: 'auto_execute',
    boundGeneration: 1,
    toolCallTimeoutMs: 60_000,
    exposure: 'deferred',
    ...overrides,
  };
}

describe('ToolSearchTool', () => {
  const tool = new ToolSearchTool(new ToolExposureConfigService(configService()));

  it('rejects empty query', async () => {
    const result = await tool.execute(
      { query: '   ' },
      {
        userId: 'u',
        sessionId: 's',
        messageId: 'm',
        toolCallId: 'c',
      },
      { index: new DeferredToolSearchIndex([entry()]), activatedTools: new Set() },
    );
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error.code).toBe(AGENT_ERROR_CODES.invalidToolArguments);
    }
  });

  it('does not consume activation slots for tools already activated in the Run', async () => {
    const index = new DeferredToolSearchIndex([
      entry({ publicName: 'mcp__demo__a' }),
      entry({ publicName: 'mcp__demo__b', description: 'Second tool' }),
    ]);
    const activated = new Set(['mcp__demo__a']);
    const result = await tool.execute(
      { query: 'demo', limit: 2 },
      {
        userId: 'u',
        sessionId: 's',
        messageId: 'm',
        toolCallId: 'c',
      },
      { index, activatedTools: activated },
    );
    expect(result.status).toBe('succeeded');
    if (result.status === 'succeeded') {
      expect(result.output.activatedCandidates).toEqual(['mcp__demo__b']);
    }
  });

  it('activates truncated schema results so deferred tools remain callable', async () => {
    const hugeParams = { type: 'object', blob: 'x'.repeat(TOOL_SEARCH_MAX_SCHEMA_CHARS + 100) };
    const index = new DeferredToolSearchIndex([
      entry({ publicName: 'mcp__demo__huge', parameters: hugeParams }),
    ]);
    const result = await tool.execute(
      { query: 'mcp__demo__huge' },
      {
        userId: 'u',
        sessionId: 's',
        messageId: 'm',
        toolCallId: 'c',
      },
      { index, activatedTools: new Set() },
    );
    expect(result.status).toBe('succeeded');
    if (result.status === 'succeeded') {
      expect(result.output.tools[0]).toMatchObject({ truncated: true });
      expect(result.output.activatedCandidates).toEqual(['mcp__demo__huge']);
    }
  });
});
