import {
  assertAgentMcpHttpsUrl,
  normalizeMcpUrlForCompare,
  redactMcpUrlForDisplay,
} from '../../../src/mcp/mcp-url-security';

describe('mcp-url-security', () => {
  it('accepts public https URL', () => {
    expect(assertAgentMcpHttpsUrl('https://agent.tinyfish.ai/mcp').hostname).toBe(
      'agent.tinyfish.ai',
    );
  });

  it('rejects http and localhost', () => {
    expect(() => assertAgentMcpHttpsUrl('http://example.com/mcp')).toThrow(/https/);
    expect(() => assertAgentMcpHttpsUrl('https://127.0.0.1/mcp')).toThrow();
    expect(() => assertAgentMcpHttpsUrl('https://localhost/mcp')).toThrow();
  });

  it('redacts sensitive query params', () => {
    const redacted = redactMcpUrlForDisplay(
      'https://api.example.com/mcp/?token=secret-value&other=1',
    );
    expect(decodeURIComponent(redacted)).toContain('token=[REDACTED]');
    expect(redacted).not.toContain('secret-value');
    expect(redacted).toContain('other=1');
  });

  it('normalizes trailing slash for compare', () => {
    expect(normalizeMcpUrlForCompare('https://example.com/mcp/')).toBe(
      normalizeMcpUrlForCompare('https://example.com/mcp'),
    );
  });
});
