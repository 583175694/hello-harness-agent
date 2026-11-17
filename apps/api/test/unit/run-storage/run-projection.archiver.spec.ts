import { describe, expect, it, vi } from 'vitest';

import { AGENT_TOOL_NAMES } from '@harness/agent-protocol';

import {
  enforceResearchProjectionByteLimit,
  foldExecutionsForCountLimit,
  RunProjectionArchiver,
  shrinkBlocksForByteLimit,
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
  it('trimForCheckpoint does not touch object storage', async () => {
    const putObject = vi.fn(async (input) => ({ objectKey: input.key }));
    const archiver = makeArchiver({ putObject }, {});
    const large = 'x'.repeat(9000);
    archiver.trimForCheckpoint({
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
        },
      ],
      sources: [],
      blocks: [],
    });
    expect(putObject).not.toHaveBeenCalled();
  });

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

describe('execution count folding', () => {
  const execution = (index: number, overrides: Record<string, unknown> = {}) => ({
    toolCallId: `call-${index}`,
    toolName: AGENT_TOOL_NAMES.readFile,
    input: { fileId: 'file-1', scope: 'file' as const },
    status: 'completed' as const,
    startedAt: '2026-10-11T00:00:00.000Z',
    completedAt: '2026-10-11T00:00:01.000Z',
    durationMs: 1000,
    ...overrides,
  });

  it('keeps delivery, failed and referenced executions while folding the rest', () => {
    const executions = Array.from({ length: 60 }, (_, index) => execution(index));
    executions[0] = execution(0, { status: 'failed' });
    executions[5] = execution(5, { toolName: AGENT_TOOL_NAMES.createReport });
    const result = foldExecutionsForCountLimit(
      {
        executions,
        sources: [
          {
            kind: 'clue',
            used: false,
            id: 'source-1',
            title: 'demo',
            url: 'https://example.com',
            domain: 'example.com',
            snippet: 'demo',
            provider: 'serp',
            provenance: 'search_clue',
            retrievedAt: '2026-10-11T00:00:00.000Z',
            toolCallIds: ['call-59'],
          },
        ],
        blocks: [],
      },
      10,
      vi.fn(),
    );
    expect(result.executions).toHaveLength(10);
    const ids = result.executions.map((item) => item.toolCallId);
    expect(ids).toContain('call-0');
    expect(ids).toContain('call-5');
    expect(ids).toContain('call-59');
    // 折叠后仍保持原始时间线顺序。
    expect(ids).toEqual([...ids].sort((left, right) => {
      const leftIndex = Number(left.slice('call-'.length));
      const rightIndex = Number(right.slice('call-'.length));
      return leftIndex - rightIndex;
    }));
  });

  it('drops tool activity blocks whose execution was folded', async () => {
    const archiver = makeArchiver({}, {});
    const executions = Array.from({ length: 140 }, (_, index) => execution(index));
    const blocks = Array.from({ length: 140 }, (_, index) => ({
      id: `block-${index}`,
      type: 'tool_activity' as const,
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: index,
      toolCallId: `call-${index}`,
      toolName: AGENT_TOOL_NAMES.readFile,
      status: 'completed' as const,
      title: '读取文件',
      startedAt: '2026-10-11T00:00:00.000Z',
    }));
    const result = await archiver.trimAndPersist({
      runId: 'run-1',
      sessionId: 'session-1',
      projection: {
        executions,
        sources: [],
        blocks,
      },
    });
    const keptIds = new Set(result.executions.map((item) => item.toolCallId));
    for (const block of result.blocks) {
      if (block.type === 'tool_activity') expect(keptIds.has(block.toolCallId)).toBe(true);
    }
  });

  it('persists more than the legacy 40-call cap without failing schema validation', async () => {
    const archiver = makeArchiver({}, {});
    const executions = Array.from({ length: 60 }, (_, index) => execution(index));
    const result = await archiver.trimAndPersist({
      runId: 'run-1',
      sessionId: 'session-1',
      projection: { executions, sources: [], blocks: [] },
    });
    expect(result.executions).toHaveLength(60);
  });

  it('folds oversized projections down to the protocol limit', async () => {
    const archiver = makeArchiver({}, {});
    const executions = Array.from({ length: 140 }, (_, index) => execution(index));
    const result = await archiver.trimAndPersist({
      runId: 'run-1',
      sessionId: 'session-1',
      projection: { executions, sources: [], blocks: [] },
    });
    expect(result.executions.length).toBeLessThanOrEqual(128);
  });
});

describe('shrinkBlocksForByteLimit', () => {
  it('keeps tool_activity while dropping reasoning', () => {
    const blocks = shrinkBlocksForByteLimit(
      [
        {
          id: 'r1',
          type: 'reasoning',
          roundId: 'round-1',
          roundSequence: 1,
          blockSequence: 0,
          content: 'x'.repeat(500),
        },
        {
          id: 't1',
          type: 'tool_activity',
          toolCallId: 'call-1',
          toolName: 'web_search',
          status: 'completed',
          title: '搜索',
          startedAt: '2026-10-11T00:00:01.000Z',
        },
      ],
      { maxReasoningChars: 0, dropProcessText: true },
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe('tool_activity');
  });
});

describe('enforceResearchProjectionByteLimit', () => {
  it(
    'truncates oversized projections',
    () => {
    const huge = 'y'.repeat(513_000);
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
    },
    20_000,
  );
});
