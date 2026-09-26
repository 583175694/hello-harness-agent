import { partitionMcpHeaders, redactMcpHeadersForDisplay } from '../../../src/mcp/mcp-config-secrets';

describe('mcp-config-secrets', () => {
  it('partitions Authorization into bearer secret', () => {
    const { headersPlain, secrets } = partitionMcpHeaders({
      Authorization: 'Bearer sk-test',
      'X-Custom': 'plain',
    });
    expect(headersPlain).toEqual({ 'X-Custom': 'plain' });
    expect(secrets).toEqual([
      { kind: 'bearer', name: 'Authorization', value: 'sk-test' },
    ]);
  });

  it('redacts sensitive headers for display', () => {
    expect(
      redactMcpHeadersForDisplay({ Authorization: 'Bearer x', 'X-Api-Key': 'y' }),
    ).toEqual({ Authorization: '[REDACTED]', 'X-Api-Key': '[REDACTED]' });
  });
});
