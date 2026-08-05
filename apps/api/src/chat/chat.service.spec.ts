import { ConfigService } from '@nestjs/config';
import type OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../database/prisma.service';
import { SessionExecutionRegistry } from '../sessions/session-execution.registry';
import { ChatService } from './chat.service';

// 创建不连接数据库和网络的 ChatService 测试环境。
function makeService(providerCreate: ReturnType<typeof vi.fn>) {
  const messageCreate = vi.fn().mockResolvedValue({});
  const sessionUpdate = vi.fn().mockResolvedValue({});
  const storedMessages = Array.from({ length: 25 }, (_, index) => ({
    id: `message-${index}`,
    userId: 'local-user',
    sessionId: 'session-1',
    role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
    kind: index % 2 === 0 ? 'user_message' as const : 'assistant_delivery' as const,
    content: `content-${index}`,
    createdAt: new Date(1_700_000_000_000 + index),
    metadata: {},
  }));
  const prisma = {
    session: {
      findFirst: vi.fn().mockResolvedValue({ id: 'session-1', userId: 'local-user' }),
      update: sessionUpdate,
    },
    message: {
      create: messageCreate,
      findMany: vi.fn().mockResolvedValue(storedMessages.slice(-20).reverse()),
    },
    $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  const config = {
    get: vi.fn((key: string) => key === 'OPENAI_API_KEY' ? 'test-key' : undefined),
    getOrThrow: vi.fn(() => 'test-model'),
  };
  const executions = new SessionExecutionRegistry();
  const service = new ChatService(
    config as unknown as ConfigService,
    prisma as unknown as PrismaService,
    executions,
  );
  (service as unknown as { client: OpenAI }).client = {
    chat: { completions: { create: providerCreate } },
  } as unknown as OpenAI;
  return { service, messageCreate, executions, prisma };
}

// 收集异步事件流，确保生成器完整执行到持久化阶段。
async function collect(stream: AsyncIterable<unknown>): Promise<unknown[]> {
  const values: unknown[] = [];
  for await (const value of stream) values.push(value);
  return values;
}

describe('ChatService session persistence', () => {
  it('loads only the latest 20 database messages and persists a completed assistant', async () => {
    const providerCreate = vi.fn().mockResolvedValue((async function* () {
      yield { choices: [{ delta: { content: '完整' } }] };
      yield { choices: [{ delta: { content: '回答' } }] };
    })());
    const { service, messageCreate, executions } = makeService(providerCreate);

    const prepared = await service.prepareSessionStream('session-1', 'new question');
    expect(prepared.messages).toHaveLength(20);
    expect(prepared.messages[0]).toMatchObject({ id: 'message-5', content: 'content-5' });
    const events = await collect(service.streamPrepared(prepared));
    service.releaseSession('session-1');

    expect(events).toEqual([
      { type: 'message.delta', messageId: prepared.assistantMessageId, delta: '完整' },
      { type: 'message.delta', messageId: prepared.assistantMessageId, delta: '回答' },
      { type: 'message.completed', messageId: prepared.assistantMessageId, model: 'test-model' },
    ]);
    expect(messageCreate).toHaveBeenCalledTimes(2);
    expect(messageCreate.mock.calls[1]?.[0]).toMatchObject({
      data: {
        id: prepared.assistantMessageId,
        role: 'assistant',
        kind: 'assistant_delivery',
        content: '完整回答',
      },
    });
    expect(executions.isActive('session-1')).toBe(false);
  });

  it('retains only the user message when the provider fails', async () => {
    const providerCreate = vi.fn().mockRejectedValue(new Error('provider unavailable'));
    const { service, messageCreate } = makeService(providerCreate);
    const prepared = await service.prepareSessionStream('session-1', 'new question');

    await expect(collect(service.streamPrepared(prepared))).rejects.toThrow();
    service.releaseSession('session-1');
    expect(messageCreate).toHaveBeenCalledTimes(1);
    expect(messageCreate.mock.calls[0]?.[0]).toMatchObject({
      data: { role: 'user', kind: 'user_message', content: 'new question' },
    });
  });
});
