import { describe, expect, it, vi } from 'vitest';

import { RunToolOutputService } from '../../../src/runs/run-tool-output.service';

describe('RunToolOutputService', () => {
  it('returns a signed url for owned runs with stored outputs', async () => {
    const prisma = {
      agentRunToolOutput: {
        findUnique: vi.fn().mockResolvedValue({
          storageKey: 'runs/run-1/tools/call-1/output.json',
          byteSize: 9000,
          contentType: 'application/json; charset=utf-8',
        }),
      },
    };
    const runs = {
      findOwned: vi.fn().mockResolvedValue({ id: 'run-1' }),
    };
    const storage = {
      createReadUrl: vi.fn().mockResolvedValue('https://signed.example/output'),
    };
    const service = new RunToolOutputService(
      prisma as never,
      runs as never,
      storage as never,
    );

    await expect(service.createOutputUrl('run-1', 'call-1', 'user-1')).resolves.toEqual({
      url: 'https://signed.example/output',
      expiresInSeconds: 300,
      byteSize: 9000,
      contentType: 'application/json; charset=utf-8',
    });
  });

  it('rejects missing ownership', async () => {
    const service = new RunToolOutputService(
      { agentRunToolOutput: { findUnique: vi.fn() } } as never,
      { findOwned: vi.fn().mockResolvedValue(undefined) } as never,
      { createReadUrl: vi.fn() } as never,
    );

    await expect(service.createOutputUrl('run-1', 'call-1', 'user-1')).rejects.toMatchObject({
      status: 404,
    });
  });
});
