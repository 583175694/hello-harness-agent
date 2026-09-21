import { describe, expect, it, vi } from 'vitest';

import { SandboxError } from '../../../src/sandbox/sandbox-error';
import { ExecuteCommandTool } from '../../../src/tools/execute-command.tool';

describe('ExecuteCommandTool', () => {
  it('resolves defaults and advertises approval plus a 130s outer budget', () => {
    const tool = new ExecuteCommandTool(
      { isAvailable: () => true } as never,
      {} as never,
    );
    expect(tool.executionPolicy).toEqual({ timeoutMs: 130_000, approval: 'require_approval' });
    expect(tool.resolve({ command: 'pwd' })).toEqual({
      command: 'pwd',
      cwd: '/workspace',
      timeoutMs: 30_000,
    });
    expect(tool.resolve({ command: 'pwd', timeoutMs: 200_000 }).timeoutMs).toBe(120_000);
    expect(tool.definition().description).toContain('不要假设外网可用');
  });

  it('does not execute when staging fails', async () => {
    const execute = vi.fn();
    const tool = new ExecuteCommandTool(
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
    );
    const result = await tool.execute(
      { command: 'echo x', inputFiles: [{ fileId: 'f1', path: 'in.txt' }] },
      { sessionId: 's1', runId: 'r1', messageId: 'm1', toolCallId: 'c1' },
    );
    expect(execute).not.toHaveBeenCalled();
    expect(result.status).toBe('failed');
  });
});
