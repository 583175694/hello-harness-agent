import { describe, expect, it } from 'vitest';
import {
  formatMcpInstructionsBlock,
  MCP_INSTRUCTIONS_GLOBAL_MAX_BYTES,
} from '../../../src/mcp/mcp-instructions.format';

describe('formatMcpInstructionsBlock', () => {
  it('skips empty instructions', () => {
    expect(formatMcpInstructionsBlock([])).toBe('');
    expect(
      formatMcpInstructionsBlock([{ serverName: 'a', text: '  ', maxInstructionBytes: 100 }]),
    ).toBe('');
  });

  it('wraps server instructions', () => {
    const block = formatMcpInstructionsBlock([
      { serverName: 'demo', text: 'Use ping only.', maxInstructionBytes: 1024 },
    ]);
    expect(block).toContain('<mcp_instructions server="demo">');
    expect(block).toContain('Use ping only.');
  });

  it('truncates per-server bytes', () => {
    const long = 'x'.repeat(500);
    const block = formatMcpInstructionsBlock([
      { serverName: 'demo', text: long, maxInstructionBytes: 50 },
    ]);
    expect(Buffer.byteLength(block, 'utf8')).toBeLessThanOrEqual(50 + 64);
  });

  it('respects global max bytes across servers', () => {
    const block = formatMcpInstructionsBlock(
      [
        { serverName: 'a', text: 'a'.repeat(40_000), maxInstructionBytes: 40_000 },
        { serverName: 'b', text: 'b'.repeat(40_000), maxInstructionBytes: 40_000 },
      ],
      MCP_INSTRUCTIONS_GLOBAL_MAX_BYTES,
    );
    expect(Buffer.byteLength(block, 'utf8')).toBeLessThanOrEqual(MCP_INSTRUCTIONS_GLOBAL_MAX_BYTES);
  });
});
