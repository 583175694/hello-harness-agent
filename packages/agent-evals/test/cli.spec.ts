import { describe, expect, it } from 'vitest';
import { parseCliArguments, resolveWorkspaceEnvironmentPath } from '../src/cli.js';

describe('parseCliArguments', () => {
  it('uses stable smoke defaults', () => {
    expect(parseCliArguments([])).toEqual({
      suite: 'smoke', keepSessions: false, skipJudge: false, apiBaseUrl: 'http://127.0.0.1:4318',
    });
  });

  it('parses all supported options and rejects unknown arguments', () => {
    expect(parseCliArguments([
      '--suite', 'full', '--case', 'case-id', '--keep-sessions', '--skip-judge',
      '--api-base-url', 'http://localhost:9000/', '--output', '/tmp/eval',
    ])).toEqual({
      suite: 'full', caseId: 'case-id', keepSessions: true, skipJudge: true,
      apiBaseUrl: 'http://localhost:9000', output: '/tmp/eval',
    });
    expect(() => parseCliArguments(['--unknown'])).toThrow('未知或缺少值');
  });

  it('resolves the root env independently from the process working directory', () => {
    expect(resolveWorkspaceEnvironmentPath('file:///workspace/packages/agent-evals/dist/cli.js'))
      .toBe('/workspace/.env');
  });
});
