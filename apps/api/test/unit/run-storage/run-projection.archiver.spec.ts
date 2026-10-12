import { describe, expect, it, vi } from 'vitest';

import { AGENT_TOOL_NAMES } from '@harness/agent-protocol';

import {
  enforceResearchProjectionByteLimit,
  RunProjectionArchiver,
} from '../../../src/run-storage/run-projection.archiver';
import type { RunObjectStorage } from '../../../src/run-storage/run-object.storage';
import type { RunToolOutputRepository } from '../../../src/run-storage/run-tool-output.repository';

function makeArchiver(storage: Partial<RunObjectStorage>, toolOutputs: Partial<RunToolOutputRepository>) {
  return new RunProjectionArchiver(
    {
      putObject: vi.fn(async (input) => ({ objectKey: input.key })),
      ...storage,
    } as RunObjectStorage,
    {
      upsert: vi.fn(async () => undefined),
      ...toolOutputs,
    } as RunToolOutputRepository,
    { warn: vi.fn(), log: vi.fn() } as never,
  );
}

describe('RunProjectionArchiver', () => {
  it('archives external tool previews above inline limit', async () => {
    const putObject = vi.fn(async (input) => ({ objectKey: input.key }));
    const upsert = vi.fn(async () => undefined);
    const archiver = makeArchiver({ putObject }, { upsert });
    const large = 'x'.repeat(9000);

    const result = await archiver.trimAndPersist({
      runId: 'run-1',
      sessionId: 'session-1',
      projection: {
        executions: [
          {
            toolCallId: 'call-1',
            toolName: AGENT_TOOL_NAMES.externalTool,
            publicName: 'demo',
            subKind: 'mcp',
            input: {},
            status: 'completed',
            startedAt: '2026-10-11T00:00:00.000Z',
            completedAt: '2026-10-11T00:00:01.000Z',
            durationMs: 1000,
            outputPreview: large,
            outputCharCount: large.length,
          },
        ],
        sources: [],
        blocks: [],
      },
    });

    expect(putObject).toHaveBeenCalled();
    expect(upsert).toHaveBeenCalled();
    expect(result.executions[0]).toMatchObject({
      outputRef: 'runs/run-1/tools/call-1/output.json',
      outputBytes: 9000,
    });
    expect(result.executions[0]?.outputPreview?.length ?? 0).toBeLessThan(large.length);
  });

  it('keeps small external tool previews inline', async () => {
    const putObject = vi.fn(async (input) => ({ objectKey: input.key }));
    const archiver = makeArchiver({ putObject }, {});
    const preview = 'small-output';

    const result = await archiver.trimAndPersist({
      runId: 'run-1',
      sessionId: 'session-1',
      projection: {
        executions: [
          {
            toolCallId: 'call-1',
            toolName: AGENT_TOOL_NAMES.externalTool,
            publicName: 'demo',
            subKind: 'mcp',
            input: {},
            status: 'completed',
            startedAt: '2026-10-11T00:00:00.000Z',
            completedAt: '2026-10-11T00:00:01.000Z',
            durationMs: 1000,
            outputPreview: preview,
          },
        ],
        sources: [],
        blocks: [],
      },
    });

    expect(putObject).not.toHaveBeenCalled();
    expect(result.executions[0]?.outputPreview).toBe(preview);
  });
});

describe('enforceResearchProjectionByteLimit', () => {
  it('truncates oversized projections', () => {
    const huge = 'y'.repeat(520_000);
    const warned = vi.fn();
    const result = enforceResearchProjectionByteLimit(
      {
        executions: [
          {
            toolCallId: 'call-1',
            toolName: AGENT_TOOL_NAMES.externalTool,
            publicName: 'demo',
            subKind: 'mcp',
            input: {},
            status: 'completed',
            startedAt: '2026-10-11T00:00:00.000Z',
            completedAt: '2026-10-11T00:00:01.000Z',
            durationMs: 1000,
            outputPreview: huge,
          },
        ],
        sources: [],
        blocks: [],
      },
      warned,
    );
    expect(warned).toHaveBeenCalled();
    expect(result.executions[0]?.outputPreview?.length ?? 0).toBeLessThan(huge.length);
  });
});
