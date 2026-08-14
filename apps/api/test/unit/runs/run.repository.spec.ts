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
});
