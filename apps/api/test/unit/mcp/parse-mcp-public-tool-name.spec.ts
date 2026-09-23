import { describe, expect, it } from 'vitest';

import { parseMcpPublicToolName } from '../../../src/mcp/parse-mcp-public-tool-name';

describe('parseMcpPublicToolName', () => {
  it('parses server and raw tool segments', () => {
    expect(parseMcpPublicToolName('mcp__tushareMcp__trade_cal')).toEqual({
      serverName: 'tushareMcp',
      rawName: 'trade_cal',
    });
    expect(parseMcpPublicToolName('web_search')).toBeNull();
  });
});
