import { describe, expect, it } from 'vitest';

import { mcpIconSrcFromSnapshot } from '../../../src/mcp/mcp-icon-resolver';
import type { RunMcpSnapshot } from '../../../src/mcp/mcp.types';

describe('mcpIconSrcFromSnapshot', () => {
  it('resolves tool icon from run snapshot', () => {
    const snapshot: RunMcpSnapshot = {
      catalogGeneration: 1,
      serverInstructions: [],
      latchedServerNames: ['tinyfish'],
      serverIcons: [],
      serverToolPolicy: [{ serverName: 'tinyfish', enabledTools: null }],
      entries: [
        {
          publicName: 'mcp__tinyfish__search',
          serverName: 'tinyfish',
          rawName: 'search',
          description: 'search',
          parameters: { type: 'object' },
          defaultApproval: 'require_approval',
          boundGeneration: 1,
          toolCallTimeoutMs: 60_000,
          icons: [{ src: 'https://example.com/search.png', mimeType: 'image/png' }],
        },
      ],
    };
    expect(mcpIconSrcFromSnapshot('mcp__tinyfish__search', snapshot)).toBe(
      'https://example.com/search.png',
    );
  });

  it('uses built-in server fallback when wire icons are missing', () => {
    const snapshot: RunMcpSnapshot = {
      catalogGeneration: 1,
      serverInstructions: [],
      latchedServerNames: ['tinyfish'],
      serverIcons: [],
      serverToolPolicy: [{ serverName: 'tinyfish', enabledTools: null }],
      entries: [
        {
          publicName: 'mcp__tinyfish__search',
          serverName: 'tinyfish',
          rawName: 'search',
          description: 'search',
          parameters: { type: 'object' },
          defaultApproval: 'require_approval',
          boundGeneration: 1,
          toolCallTimeoutMs: 60_000,
        },
      ],
    };
    expect(mcpIconSrcFromSnapshot('mcp__tinyfish__search', snapshot)).toBe(
      'https://agent.tinyfish.ai/favicon.ico',
    );
  });
});
