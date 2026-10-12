import { describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../../src/database/prisma.service';
import { AssistantDeliveryRepository } from '../../../src/persistence/assistant-delivery.repository';

describe('AssistantDeliveryRepository metadata projection', () => {
  it('stores research details separately from the assistant message metadata', async () => {
    const messageCreate = vi.fn().mockResolvedValue({});
    const detailUpsert = vi.fn().mockResolvedValue({});
    const sessionUpdate = vi.fn().mockResolvedValue({});
    const prisma = {
      message: { create: messageCreate },
      agentRunDetail: { upsert: detailUpsert },
      session: { update: sessionUpdate },
      $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    const repository = new AssistantDeliveryRepository(
      prisma as unknown as PrismaService,
      { log: vi.fn() } as never,
      { trimAndPersist: vi.fn(async (input) => input.projection) } as never,
    );
    const source = {
      kind: 'clue' as const,
      id: 'source-1',
      title: 'Source',
      url: 'https://example.com/source',
      domain: 'example.com',
      snippet: 'snippet',
      used: true,
      provider: 'bocha' as const,
      provenance: 'search_clue' as const,
      retrievedAt: '2026-10-11T00:00:00.000Z',
      toolCallIds: ['call-1'],
    };

    await repository.save({
      userId: 'user-1',
      sessionId: 'session-1',
      runId: 'run-1',
      messageId: 'message-1',
      model: 'test-model',
      blocks: [],
      toolCallCount: 1,
      executions: [],
      sources: [source],
    });

    expect(messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            agent: expect.objectContaining({ detailRef: 'run-1' }),
          }),
        }),
      }),
    );
    const messageMetadata = messageCreate.mock.calls[0]![0].data.metadata as {
      agent?: Record<string, unknown>;
    };
    expect(messageMetadata.agent).not.toHaveProperty('sources');
    expect(messageMetadata.agent).not.toHaveProperty('executions');
    expect(detailUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          runId: 'run-1',
          messageId: 'message-1',
          researchProjection: expect.objectContaining({
            executions: [],
            sources: [source],
          }),
        }),
      }),
    );
  });
});
