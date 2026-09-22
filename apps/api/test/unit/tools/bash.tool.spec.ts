import { describe, expect, it, vi } from 'vitest';

import { SandboxError } from '../../../src/sandbox/sandbox-error';
import { BashTool } from '../../../src/tools/bash.tool';

describe('BashTool', () => {
  it('resolves defaults and advertises auto_execute plus a 610s outer budget', () => {
    const tool = new BashTool(
      { isAvailable: () => true } as never,
      {} as never,
      {} as never,
      {} as never,
      { classify: () => null } as never,
      { record: () => undefined } as never,
    );
    expect(tool.executionPolicy).toEqual({ timeoutMs: 610_000, approval: 'auto_execute' });
    expect(tool.resolve({ command: 'pwd', description: 'print cwd' })).toMatchObject({
      command: 'pwd',
      cwd: '/workspace',
      timeoutMs: 120_000,
    });
    expect(tool.resolve({ command: 'pwd', description: 'x', timeoutMs: 900_000 }).timeoutMs).toBe(
      600_000,
    );
    expect(tool.name).toBe('bash');
  });

  it('does not execute when staging fails', async () => {
    const execute = vi.fn();
    const tool = new BashTool(
      {
        isAvailable: () => true,
        withSession: vi.fn(async (_runId, work) =>
          work({
            execute,
          }),
        ),
      } as never,
      {
        stage: vi.fn(async () => {
          throw new SandboxError('SANDBOX_STAGE_FAILED', '输入文件不可用。', false);
        }),
      } as never,
      {} as never,
      {} as never,
      { classify: () => null } as never,
      { record: () => undefined } as never,
    );
    const result = await tool.execute(
      { command: 'echo x', description: 'echo', inputFiles: [{ fileId: 'f1', path: 'in.txt' }] },
      { sessionId: 's1', runId: 'r1', messageId: 'm1', toolCallId: 'c1' },
    );
    expect(execute).not.toHaveBeenCalled();
    expect(result.status).toBe('failed');
  });
});
