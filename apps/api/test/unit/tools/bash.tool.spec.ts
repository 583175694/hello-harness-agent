import { describe, expect, it, vi } from 'vitest';

import { SandboxError } from '../../../src/sandbox/sandbox-error';
import { SandboxWorkspaceService } from '../../../src/sandbox/sandbox-workspace.service';
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
      { userId: 'local-user', sessionId: 's1', runId: 'r1', messageId: 'm1', toolCallId: 'c1' },
    );
    expect(execute).not.toHaveBeenCalled();
    expect(result.status).toBe('failed');
  });

  it('injects session and agent-browser env on execute', async () => {
    const execute = vi.fn(async () => ({
      exitCode: 0,
      signal: null,
      timedOut: false,
      aborted: false,
      timeoutMs: 120_000,
      stdout: 'ok',
      stderr: '',
      durationMs: 1,
    }));
    const tool = new BashTool(
      {
        isAvailable: () => true,
        acquireRunLease: vi.fn(),
        withSession: vi.fn(async (_sessionId, work) => work({ execute })),
      } as never,
      { stage: vi.fn() } as never,
      {} as never,
      {} as never,
      { classify: () => null } as never,
      { record: () => undefined } as never,
    );
    await tool.execute(
      { command: 'echo ok', description: 'echo' },
      { userId: 'local-user', sessionId: 'sess-abc', runId: 'r1', messageId: 'm1', toolCallId: 'c1' },
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          HARNESS_SESSION_ID: 'sess-abc',
          AGENT_BROWSER_SESSION: 'harness-sess-abc',
          AGENT_BROWSER_SESSION_NAME: 'harness-sess-abc',
        }),
      }),
    );
  });

  it('allows egress boost for command hosts under dynamic egress policy', async () => {
    const execute = vi.fn(async () => ({
      exitCode: 0,
      signal: null,
      timedOut: false,
      aborted: false,
      timeoutMs: 120_000,
      stdout: 'ok',
      stderr: '',
      durationMs: 1,
    }));
    const egressAudit = { record: vi.fn() };
    const tool = new BashTool(
      {
        isAvailable: () => true,
        acquireRunLease: vi.fn(),
        withSession: vi.fn(async (_sessionId, work) => work({ execute })),
      } as never,
      { stage: vi.fn() } as never,
      {} as never,
      {} as never,
      { classify: () => 'network' } as never,
      egressAudit as never,
    );
    const result = await tool.execute(
      {
        command: 'curl -fsS https://not-on-allowlist.invalid.example/',
        description: 'open egress',
      },
      {
        userId: 'local-user',
        sessionId: 's1',
        runId: 'r1',
        messageId: 'm1',
        toolCallId: 'c1',
        bashEgressBoost: true,
      },
    );
    expect(result.status).toBe('succeeded');
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        egressBoost: true,
        egressBoostHosts: ['not-on-allowlist.invalid.example'],
      }),
    );
    expect(egressAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'allow' }),
    );
  });

  it('rejects PPTX generation commands and .pptx output collection at input validation', () => {
    const tool = new BashTool(
      { isAvailable: () => true } as never,
      {} as never,
      {} as never,
      {} as never,
      { classify: () => null } as never,
      { record: () => undefined } as never,
    );

    const blockedInputs = [
      { command: 'python3 make.py', description: 'collect pptx', output: { path: 'deck.pptx' } },
      {
        command: 'python3 make.py',
        description: 'collect pptx by fileName',
        output: { path: 'out.bin', fileName: 'report.PPTX' },
      },
      { command: 'pip install python-pptx', description: 'install python-pptx' },
      { command: 'npm install pptxgenjs', description: 'install pptxgenjs' },
      {
        command: 'python3 -c "from pptx import Presentation; Presentation().save(\'a.pptx\')"',
        description: 'run python-pptx',
      },
      {
        command: 'soffice --headless --convert-to pptx slides.html',
        description: 'convert to pptx',
      },
    ];

    for (const input of blockedInputs) {
      const parsed = tool.inputSchema.safeParse(input);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        const message = parsed.error.issues.map((issue) => issue.message).join(' ');
        expect(message).toContain('ai-ppt-html');
        expect(message).toContain('ppt_export');
      }
    }

    const allowed = tool.inputSchema.safeParse({
      command: 'python3 analyze.py',
      description: 'analyze csv data',
      output: { path: 'result.csv' },
    });
    expect(allowed.success).toBe(true);
  });

  it('blocks collecting .pptx files in SandboxWorkspaceService', async () => {
    const workspace = new SandboxWorkspaceService({} as never, { importFromSandbox: vi.fn() } as never);
    const session = {
      stat: vi.fn(async () => ({ kind: 'regular_file', size: 16 })),
      download: vi.fn(async () => Buffer.from('pptx')),
    };

    await expect(
      workspace.collect({
        sessionId: 's1',
        runId: 'r1',
        toolCallId: 'c1',
        session: session as never,
        output: { path: 'deck.pptx' },
      }),
    ).rejects.toMatchObject({
      code: 'SANDBOX_COLLECT_FAILED',
      detail: expect.stringContaining('ppt_export'),
    });
  });
});
