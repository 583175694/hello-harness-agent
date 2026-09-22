import { describe, expect, it, vi } from 'vitest';

import { AGENT_ERROR_CODES } from '@harness/agent-protocol';

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
      { sessionId: 'sess-abc', runId: 'r1', messageId: 'm1', toolCallId: 'c1' },
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

  it('denies agent-browser egress when boosted host is outside allowlist', async () => {
    const prev = process.env.SANDBOX_EGRESS_HOST_ALLOWLIST_ENFORCED;
    process.env.SANDBOX_EGRESS_HOST_ALLOWLIST_ENFORCED = 'true';
    const execute = vi.fn();
    const egressAudit = { record: vi.fn() };
    const tool = new BashTool(
      {
        isAvailable: () => true,
        acquireRunLease: vi.fn(),
        withSession: vi.fn(),
      } as never,
      { stage: vi.fn() } as never,
      {} as never,
      {} as never,
      {
        classify: () => 'network',
      } as never,
      egressAudit as never,
    );
    const result = await tool.execute(
      {
        command: 'agent-browser open https://not-on-allowlist.invalid.example/',
        description: 'bad host',
      },
      {
        sessionId: 's1',
        runId: 'r1',
        messageId: 'm1',
        toolCallId: 'c1',
        bashEgressBoost: true,
      },
    );
    expect(execute).not.toHaveBeenCalled();
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe(AGENT_ERROR_CODES.sandboxUnavailable);
    expect(result.error?.detail).toMatch(/allowlist: not-on-allowlist/);
    expect(egressAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'deny' }),
    );
    process.env.SANDBOX_EGRESS_HOST_ALLOWLIST_ENFORCED = prev;
  });

  it('allows egress boost without host allowlist when enforcement is off', async () => {
    const prev = process.env.SANDBOX_EGRESS_HOST_ALLOWLIST_ENFORCED;
    delete process.env.SANDBOX_EGRESS_HOST_ALLOWLIST_ENFORCED;
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
    if (prev === undefined) delete process.env.SANDBOX_EGRESS_HOST_ALLOWLIST_ENFORCED;
    else process.env.SANDBOX_EGRESS_HOST_ALLOWLIST_ENFORCED = prev;
  });
});
