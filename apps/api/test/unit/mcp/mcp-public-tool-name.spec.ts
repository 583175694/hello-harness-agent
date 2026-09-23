import { describe, expect, it } from 'vitest';
import { publicToolName } from '../../../src/mcp/mcp-public-tool-name';

describe('publicToolName', () => {
  it('prefixes server and raw names', () => {
    expect(publicToolName('demo', 'ping')).toBe('mcp__demo__ping');
  });

  it('normalizes illegal characters', () => {
    expect(publicToolName('my-server', 'tool/name')).toBe('mcp__my-server__tool_name');
  });

  it('keeps public and raw names separable', () => {
    const publicName = publicToolName('github', 'create_issue');
    expect(publicName).toContain('github');
    expect(publicName).toContain('create_issue');
    expect(publicName.startsWith('mcp__')).toBe(true);
  });
});
