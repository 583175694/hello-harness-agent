import { describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../../src/database/prisma.service';
import { RunRepository } from '../../../src/runs/run.repository';

function transcriptItem(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    sessionId: 'session-1',
    runId: 'old-run',
    messageId: null,
    sequence: 1,
    runSequence: 1,
    kind: 'assistant',
    state: 'committed',
    content: '回答',
    reasoning: '历史推理',
    toolCalls: null,
    toolCallId: null,
    metadata: null,
    provider: 'other-provider',
    model: 'other-model',
    reasoningEffort: 'high',
    reasoningFormat: 'other.reasoning.v1',
    schemaVersion: 1,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('RunRepository reasoning transcript boundaries', () => {
  it('restores a durable tool control outcome without changing provider-visible content', async () => {
    const prisma = {
      agentRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'run-1',
          sessionId: 'session-1',
          provider: 'deepseek',
          reasoningFormat: null,
        }),
      },
      modelTranscriptItem: {
        findMany: vi.fn().mockResolvedValue([
          transcriptItem({
            runId: 'run-1',
            kind: 'user',
            state: 'active',
            content: '执行审批工具',
            reasoning: null,
            provider: 'deepseek',
            reasoningFormat: null,
          }),
          transcriptItem({
            sequence: 2,
            runSequence: 2,
            toolCalls: [{ id: 'call-1', name: 'approval_test', arguments: '{}' }],
            reasoning: null,
            provider: 'deepseek',
            reasoningFormat: null,
          }),
          transcriptItem({
            sequence: 3,
            runSequence: 3,
            kind: 'tool_result',
            content: '{"ok":true}',
            reasoning: null,
            toolCallId: 'call-1',
            metadata: { toolControlOutcome: 'approved_by_user' },
            provider: 'deepseek',
            reasoningFormat: null,
          }),
        ]),
      },
    };
    const repository = new RunRepository(prisma as unknown as PrismaService);

    await expect(repository.loadTranscript('run-1')).resolves.toContainEqual({
      role: 'tool',
      content: '{"ok":true}',
      toolCallId: 'call-1',
      controlOutcome: 'approved_by_user',
    });
  });

  it('persists tool control outcomes in transcript metadata', async () => {
    const create = vi.fn().mockResolvedValue({});
    const tx = {
      agentRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'run-1',
          sessionId: 'session-1',
          assistantMessageId: 'assistant-1',
          provider: 'deepseek',
          model: 'test-model',
          reasoningEffort: 'high',
          reasoningFormat: null,
          status: 'running',
        }),
      },
      modelTranscriptItem: {
        findFirst: vi.fn().mockResolvedValue(null),
        create,
      },
    };
    const prisma = { ...tx, $transaction: vi.fn(async (callback) => callback(tx)) };
    const repository = new RunRepository(prisma as unknown as PrismaService);

    await repository.appendTranscriptItem('run-1', {
      role: 'tool',
      content: '{"ok":true}',
      toolCallId: 'call-1',
      controlOutcome: 'approved_by_user',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: { toolControlOutcome: 'approved_by_user' },
        }),
      }),
    );
  });
  it('does not apply native reasoning compatibility checks to final no-tool reasoning', async () => {
    const prisma = {
      agentRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'run-1',
          sessionId: 'session-1',
          provider: 'deepseek',
          reasoningFormat: 'deepseek.reasoning_content.v1',
        }),
      },
      modelTranscriptItem: {
        findMany: vi.fn().mockResolvedValue([
          transcriptItem(),
          transcriptItem({
            id: 'current-user',
            runId: 'run-1',
            sequence: 2,
            kind: 'user',
            state: 'active',
            content: '新问题',
            reasoning: null,
            provider: 'deepseek',
            model: 'deepseek-v4-pro',
            reasoningFormat: 'deepseek.reasoning_content.v1',
          }),
        ]),
      },
    };
    const repository = new RunRepository(prisma as unknown as PrismaService);

    await expect(repository.loadTranscript('run-1')).resolves.toEqual([
      { role: 'assistant', content: '回答', reasoning: '历史推理' },
      { role: 'user', content: '新问题' },
    ]);
  });

  it('rejects incompatible reasoning that belongs to a historical tool-call unit', async () => {
    const prisma = {
      agentRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'run-1',
          sessionId: 'session-1',
          provider: 'deepseek',
          reasoningFormat: 'deepseek.reasoning_content.v1',
        }),
      },
      modelTranscriptItem: {
        findMany: vi.fn().mockResolvedValue([
          transcriptItem({
            toolCalls: [
              {
                id: 'call-1',
                name: 'web_search',
                arguments: '{}',
                blockSequence: 1,
                providerIndex: 0,
              },
            ],
          }),
          transcriptItem({
            id: 'tool-result',
            sequence: 2,
            runSequence: 2,
            kind: 'tool_result',
            content: '{"ok":true}',
            reasoning: null,
            toolCallId: 'call-1',
          }),
          transcriptItem({
            id: 'current-user',
            runId: 'run-1',
            sequence: 3,
            kind: 'user',
            state: 'active',
            content: '新问题',
            reasoning: null,
            provider: 'deepseek',
            model: 'deepseek-v4-pro',
            reasoningFormat: 'deepseek.reasoning_content.v1',
          }),
        ]),
      },
    };
    const repository = new RunRepository(prisma as unknown as PrismaService);

    await expect(repository.loadTranscript('run-1')).rejects.toThrow(
      'MODEL_TRANSCRIPT_INCOMPATIBLE',
    );
  });

  it('deletes active transcript items when reconciliation interrupts a run', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const prisma = {
      agentRun: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'run-1',
            assistantMessageId: 'assistant-1',
            messages: [{ id: 'assistant-1', metadata: {} }],
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
      message: { update: vi.fn().mockResolvedValue({}) },
      modelTranscriptItem: { deleteMany },
      $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    const repository = new RunRepository(prisma as unknown as PrismaService);

    await (
      repository as unknown as {
        interruptRuns(where: Record<string, unknown>): Promise<void>;
      }
    ).interruptRuns({ status: 'running' });

    expect(deleteMany).toHaveBeenCalledWith({
      where: { runId: 'run-1', state: 'active' },
    });
  });

  it('atomically persists the in-memory compaction state when a run completes', async () => {
    const compactionState = {
      summary: 'summary',
      coveredMessageCount: 8,
      coveredThroughItemId: null,
      version: 2,
      tokenCount: 10,
    };
    const tx = {
      agentRun: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ sessionId: 'session-1' }),
      },
      contextCompactionState: { upsert: vi.fn().mockResolvedValue({}) },
      modelTranscriptItem: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        deleteMany: vi.fn(),
      },
      message: { update: vi.fn().mockResolvedValue({}) },
    };
    const prisma = { ...tx, $transaction: vi.fn(async (callback) => callback(tx)) };
    const repository = new RunRepository(prisma as unknown as PrismaService);

    await expect(
      repository.terminal({
        runId: 'run-1',
        assistantMessageId: 'assistant-1',
        status: 'completed',
        projection: {
          model: 'deepseek-v4-flash',
          blocks: [],
          toolCallCount: 0,
          executions: [],
          sources: [],
          observability: { modelRounds: [] },
        } as never,
        lastEventSequence: 3,
        draftVersion: 1,
        compactionState,
      }),
    ).resolves.toBe(true);

    expect(tx.contextCompactionState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 'session-1' },
        create: expect.objectContaining({ summary: 'summary', coveredMessageCount: 8 }),
      }),
    );
    expect(tx.modelTranscriptItem.updateMany).toHaveBeenCalled();
  });

  it.each(['failed', 'cancelled'] as const)(
    'does not persist compaction state when a run ends as %s',
    async (status) => {
      const tx = {
        agentRun: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        contextCompactionState: { upsert: vi.fn() },
        modelTranscriptItem: {
          updateMany: vi.fn(),
          deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        message: { update: vi.fn().mockResolvedValue({}) },
      };
      const prisma = { ...tx, $transaction: vi.fn(async (callback) => callback(tx)) };
      const repository = new RunRepository(prisma as unknown as PrismaService);

      await repository.terminal({
        runId: 'run-1',
        assistantMessageId: 'assistant-1',
        status,
        projection: {
          model: 'deepseek-v4-flash',
          blocks: [],
          toolCallCount: 0,
          executions: [],
          sources: [],
          observability: { modelRounds: [] },
        } as never,
        lastEventSequence: 3,
        draftVersion: 1,
      });

      expect(tx.contextCompactionState.upsert).not.toHaveBeenCalled();
      expect(tx.modelTranscriptItem.deleteMany).toHaveBeenCalled();
    },
  );
});
