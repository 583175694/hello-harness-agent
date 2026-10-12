import { describe, expect, it, vi } from 'vitest';

import { SessionsService } from '../../../src/sessions/sessions.service';
import { PrismaService } from '../../../src/database/prisma.service';
import { SessionTitleService } from '../../../src/sessions/session-title.service';
import { RunRepository } from '../../../src/runs/run.repository';
import { PendingUserInputService } from '../../../src/runs/pending-user-input.service';
import { FileStorage } from '../../../src/file-storage/file-storage';

function message(id: string, createdAt: Date, role: 'user' | 'assistant' = 'user') {
  return {
    id,
    sessionId: 'session-1',
    userId: 'user-1',
    role,
    kind: role === 'user' ? 'user_message' : 'assistant_delivery',
    content: id,
    metadata: {},
    runId: null,
    createdAt,
    attachments: [],
  };
}

function session(messages: ReturnType<typeof message>[]) {
  return {
    id: 'session-1',
    userId: 'user-1',
    title: '测试会话',
    isPinned: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    messages,
    runs: [],
    artifactSeries: [],
  };
}

describe('SessionsService pagination', () => {
  it('returns the newest page and a stable message cursor', async () => {
    const first = new Date('2026-01-01T00:00:00.000Z');
    const messages = [
      message('m3', new Date('2026-01-01T00:00:01.000Z')),
      message('m2', first),
      message('m1', first),
    ];
    const prisma = {
      message: { findFirst: vi.fn() },
      agentRunDetail: { findMany: vi.fn().mockResolvedValue([]) },
      session: { findFirst: vi.fn().mockResolvedValue(session(messages)) },
    };
    const pendingInputs = { list: vi.fn().mockResolvedValue([]) };
    const service = new SessionsService(
      prisma as unknown as PrismaService,
      {} as SessionTitleService,
      {} as never,
      {} as RunRepository,
      pendingInputs as unknown as PendingUserInputService,
      {} as FileStorage,
      { deletePrefix: vi.fn().mockResolvedValue(undefined) } as never,
    );

    const result = await service.detail('user-1', 'session-1', { limit: 2 });

    expect(result.session.messages.map((item) => item.id)).toEqual(['m2', 'm3']);
    expect(result.session.pagination).toEqual({
      limit: 2,
      hasMore: true,
      nextBefore: 'm2',
    });
  });

  it('uses a message-id cursor to fetch older messages without skipping same-timestamp rows', async () => {
    const cursorTime = new Date('2026-01-01T00:00:00.000Z');
    const older = message('m1', cursorTime);
    const cursor = message('m2', cursorTime);
    const prisma = {
      message: { findFirst: vi.fn().mockResolvedValue({ id: cursor.id, createdAt: cursor.createdAt }) },
      agentRunDetail: { findMany: vi.fn().mockResolvedValue([]) },
      session: { findFirst: vi.fn().mockResolvedValue(session([older])) },
    };
    const pendingInputs = { list: vi.fn().mockResolvedValue([]) };
    const service = new SessionsService(
      prisma as unknown as PrismaService,
      {} as SessionTitleService,
      {} as never,
      {} as RunRepository,
      pendingInputs as unknown as PendingUserInputService,
      {} as FileStorage,
      { deletePrefix: vi.fn().mockResolvedValue(undefined) } as never,
    );

    const result = await service.detail('user-1', 'session-1', { limit: 2, before: 'm2' });

    expect(result.session.messages.map((item) => item.id)).toEqual(['m1']);
    expect(prisma.session.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          messages: expect.objectContaining({
            where: {
              sessionId: 'session-1',
              OR: [
                { createdAt: { lt: cursorTime } },
                { createdAt: cursorTime, id: { lt: 'm2' } },
              ],
            },
          }),
        }),
      }),
    );
  });

  it('projects large assistant metadata to lightweight session fields', async () => {
    const assistant = message('assistant-1', new Date('2026-01-01T00:00:01.000Z'), 'assistant');
    Object.assign(assistant, { runId: 'run-1' });
    assistant.metadata = {
      model: 'test-model',
      deliveryStatus: 'completed',
      blocks: Array.from({ length: 100 }, () => ({ type: 'text', content: 'large' })),
      agent: {
        toolCallCount: 3,
        detailRef: 'run-1',
        executions: [{ toolCallId: 'call-1' }],
        sources: [{ title: 'large source' }],
      },
      context: { roundSequence: 1 },
    };
    const prisma = {
      message: { findFirst: vi.fn() },
      agentRunDetail: {
        findMany: vi.fn().mockResolvedValue([
          {
            messageId: 'assistant-1',
            runId: 'run-1',
            researchProjection: {
              executions: [{ toolCallId: 'call-1' }],
              sources: [{ title: 'large source' }],
              blocks: [
                {
                  id: 'reasoning-1',
                  type: 'reasoning',
                  roundId: 'round-1',
                  roundSequence: 1,
                  blockSequence: 0,
                  content: 'thinking',
                },
                {
                  id: 'tool-1',
                  type: 'tool_activity',
                  toolCallId: 'call-1',
                  toolName: 'web_search',
                  status: 'completed',
                  title: '网页检索',
                  startedAt: '2026-01-01T00:00:00.000Z',
                  completedAt: '2026-01-01T00:00:01.000Z',
                },
              ],
            },
          },
        ]),
      },
      session: { findFirst: vi.fn().mockResolvedValue(session([assistant])) },
    };
    const pendingInputs = { list: vi.fn().mockResolvedValue([]) };
    const service = new SessionsService(
      prisma as unknown as PrismaService,
      {} as SessionTitleService,
      {} as never,
      {} as RunRepository,
      pendingInputs as unknown as PendingUserInputService,
      {} as FileStorage,
      { deletePrefix: vi.fn().mockResolvedValue(undefined) } as never,
    );

    const result = await service.detail('user-1', 'session-1', { limit: 100 });

    expect(result.session.messages[0]?.metadata).toEqual({
      deliveryStatus: 'completed',
      context: { roundSequence: 1 },
      agent: { toolCallCount: 3, executions: [], sources: [], detailRef: 'run-1' },
      blocks: [
        expect.objectContaining({ type: 'reasoning', id: 'reasoning-1' }),
        expect.objectContaining({ type: 'tool_activity', toolCallId: 'call-1' }),
      ],
    });
  });
});
