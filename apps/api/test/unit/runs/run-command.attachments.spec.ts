import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AGENT_ERROR_CODES, AGENT_PROTOCOL_LIMITS } from '@harness/agent-protocol';
import { RunCommandService } from '../../../src/runs/run-command.service';
import { SkillRegistryService } from '../../../src/skills/skill-registry.service';

const IMAGE_COUNT = AGENT_PROTOCOL_LIMITS.sessionImageAttachmentsMax;
const FILE_COUNT = AGENT_PROTOCOL_LIMITS.sessionFileAttachmentsMax;

function attachment(index: number, fileKind: 'image' | 'text') {
  return {
    id: `${fileKind}-${index}`,
    fileKind,
    sessionId: 'session-1',
    userId: 'user-1',
    status: 'ready',
  };
}

function createService() {
  const attachments = new Map<string, ReturnType<typeof attachment>>();
  for (let index = 0; index < IMAGE_COUNT + 1; index += 1)
    attachments.set(`image-${index}`, attachment(index, 'image'));
  for (let index = 0; index < FILE_COUNT + 1; index += 1)
    attachments.set(`text-${index}`, attachment(index, 'text'));

  const files = {
    findReadyForSession: vi.fn(async (_userId: string, _sessionId: string, fileId: string) => {
      const found = attachments.get(fileId);
      if (!found) throw new Error(`unexpected attachment ${fileId}`);
      return found;
    }),
  };
  const repository = {
    create: vi.fn().mockResolvedValue({
      kind: 'created' as const,
      run: {
        id: 'run-1',
        sessionId: 'session-1',
        inputMessageId: 'user-message-1',
        assistantMessageId: 'assistant-message-1',
        idempotencyKey: 'key-1',
        payloadHash: 'hash',
        status: 'queued',
      },
    }),
    snapshot: vi.fn().mockResolvedValue({ runId: 'run-1', blocks: [] }),
  };
  const service = new RunCommandService(
    repository as never,
    { get: vi.fn().mockReturnValue(undefined), register: vi.fn() } as never,
    { publish: vi.fn(), commit: vi.fn(), broadcast: vi.fn() } as never,
    { start: vi.fn() } as never,
    {
      profile: vi.fn().mockReturnValue({
        provider: 'deepseek',
        reasoningFormat: 'deepseek.reasoning_content.v1',
        reasoning: { supported: true, levels: ['off', 'high'], default: 'high' },
      }),
    } as never,
    {} as never,
    files as never,
    {} as never,
    { get: vi.fn().mockReturnValue(undefined) } as never,
    new SkillRegistryService(),
    { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
  );
  return { service, files, repository };
}

function create(service: RunCommandService, attachmentIds: string[]) {
  return service.create('user-1', 'session-1', {
    content: '请分析这些附件',
    idempotencyKey: `key-${attachmentIds.join('-')}`,
    model: 'deepseek-flash',
    attachmentIds,
  });
}

function expectCode(error: unknown, code: string) {
  expect(error).toBeInstanceOf(ConflictException);
  expect((error as ConflictException).getResponse()).toMatchObject({ code });
}

describe('RunCommandService attachment limits', () => {
  it('accepts the full image quota together with the full file quota', async () => {
    const { service, repository } = createService();
    const attachmentIds = [
      ...Array.from({ length: IMAGE_COUNT }, (_, index) => `image-${index}`),
      ...Array.from({ length: FILE_COUNT }, (_, index) => `text-${index}`),
    ];

    // 9 张图 + 4 个文件共 13 个附件，两类名额互不挤占。
    await expect(create(service, attachmentIds)).resolves.toMatchObject({ runId: 'run-1' });
    expect(repository.create).toHaveBeenCalledOnce();
  });

  it('rejects more images than the image quota', async () => {
    const { service, repository } = createService();
    const error = await create(
      service,
      Array.from({ length: IMAGE_COUNT + 1 }, (_, index) => `image-${index}`),
    ).catch((caught: unknown) => caught);

    expectCode(error, AGENT_ERROR_CODES.tooManyImageAttachments);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects more files than the file quota', async () => {
    const { service, repository } = createService();
    const error = await create(
      service,
      Array.from({ length: FILE_COUNT + 1 }, (_, index) => `text-${index}`),
    ).catch((caught: unknown) => caught);

    expectCode(error, AGENT_ERROR_CODES.tooManyFileAttachments);
    expect(repository.create).not.toHaveBeenCalled();
  });
});
