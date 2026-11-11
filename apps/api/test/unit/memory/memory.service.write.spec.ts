import { describe, expect, it, vi } from 'vitest';
import { MemoryService } from '../../../src/memory/memory.service';

function createMemoryService(overrides: {
  createIfUnderActiveCap?: ReturnType<typeof vi.fn>;
  softDelete?: ReturnType<typeof vi.fn>;
  getUserSettings?: ReturnType<typeof vi.fn>;
}) {
  const repository = {
    getUserSettings: overrides.getUserSettings ?? vi.fn().mockResolvedValue({ allowAgentWrite: true }),
    findById: vi.fn(),
    countActive: vi.fn(),
    create: vi.fn(),
    createIfUnderActiveCap: overrides.createIfUnderActiveCap ?? vi.fn(),
    softDelete: overrides.softDelete ?? vi.fn().mockResolvedValue(undefined),
    updateContent: vi.fn(),
    markSuperseded: vi.fn(),
    listActive: vi.fn().mockResolvedValue([]),
  };
  const config = {
    writeEnabled: true,
    readEnabled: true,
    activeCap: 50,
    embeddingModel: 'test-model',
    dedupThreshold: 0.92,
  };
  const embedding = { embedDocument: vi.fn() };
  const embedJob = {
    embedRecord: vi.fn().mockResolvedValue('ready'),
    scheduleEmbed: vi.fn(),
  };
  const service = new MemoryService(
    repository as never,
    config as never,
    embedding as never,
    embedJob as never,
  );
  return { service, repository, embedJob };
}

describe('MemoryService.writeFromTool', () => {
  it('returns expired status after successful delete', async () => {
    const { service, repository } = createMemoryService({});
    repository.findById.mockResolvedValue({
      memoryId: 'mem-1',
      status: 'active',
    });
    const result = await service.writeFromTool(
      'user-1',
      { sessionId: 's1', messageId: 'msg-1', toolCallId: 'call-1' },
      { action: 'delete', memoryId: 'mem-1' },
    );
    expect(result).toMatchObject({ ok: true, action: 'delete', status: 'expired' });
    expect(repository.softDelete).toHaveBeenCalledWith('user-1', 'mem-1');
  });

  it('rejects create when active cap reached in transaction', async () => {
    const { service } = createMemoryService({
      createIfUnderActiveCap: vi.fn().mockResolvedValue('limit_exceeded'),
    });
    const result = await service.writeFromTool(
      'user-1',
      { sessionId: 's1', messageId: 'msg-1', toolCallId: 'call-1' },
      { action: 'create', title: '称呼', content: '小柯' },
    );
    expect(result).toEqual({
      ok: false,
      action: 'create',
      status: 'rejected',
      reason: 'limit_exceeded',
    });
  });
});
