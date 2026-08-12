import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatStreamEvent, SessionDetail } from '@harness/agent-protocol';
import { runEvaluation } from '../src/runner.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

// 创建单题 Runner 测试使用的隔离输出目录和固定参数。
async function options(overrides: Partial<Parameters<typeof runEvaluation>[0]> = {}) {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'agent-evals-'));
  temporaryDirectories.push(outputDirectory);
  return {
    suite: 'smoke' as const,
    caseId: 'direct-event-loop',
    keepSessions: false,
    skipJudge: true,
    apiBaseUrl: 'http://unused.test',
    outputDirectory,
    command: ['eval'],
    ...overrides,
  };
}

// 构造可通过直接回答硬规则的标准 SSE 事件。
function completedEvents(): ChatStreamEvent[] {
  return [
    { type: 'message.delta', messageId: 'assistant-1', blockId: 'text-1', delta: '回答' },
    { type: 'message.completed', messageId: 'assistant-1', model: 'test-model' },
  ];
}

// 构造持久化完成的最小会话详情。
function completedSession(): SessionDetail {
  return {
    id: 'session-1',
    title: 'eval',
    status: 'active',
    isPinned: false,
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:01:00.000Z',
    activeRun: null,
    messages: [
      {
        id: 'assistant-1',
        sessionId: 'session-1',
        role: 'assistant',
        kind: 'assistant_delivery',
        content: '回答',
        createdAt: '2026-08-10T00:01:00.000Z',
        metadata: {},
      },
    ],
  };
}

// 创建可观测生命周期调用次数的 Runner API 替身。
function fakeApi(input: { chatError?: Error; deleteError?: Error } = {}) {
  return {
    assertReady: vi.fn(async () => undefined),
    createSession: vi.fn(async () => 'session-1'),
    runChat: vi.fn(async () => {
      if (input.chatError) throw input.chatError;
      return completedEvents();
    }),
    getSession: vi.fn(async () => completedSession()),
    deleteSession: vi.fn(async () => {
      if (input.deleteError) throw input.deleteError;
    }),
  };
}

describe('runEvaluation', () => {
  it('cleans up a successful case and writes consistent reports', async () => {
    const api = fakeApi();
    const runnerOptions = await options();
    const report = await runEvaluation(runnerOptions, { api });
    expect(report.hardPassed).toBe(true);
    expect(api.createSession).toHaveBeenCalledWith(
      '[EVAL] direct-event-loop',
      expect.any(AbortSignal),
    );
    expect(api.deleteSession).toHaveBeenCalledWith('session-1', expect.any(AbortSignal));
    const stored = JSON.parse(
      await readFile(join(runnerOptions.outputDirectory, 'summary.json'), 'utf8'),
    ) as typeof report;
    expect(stored.summary).toEqual(report.summary);
    expect(await readFile(join(runnerOptions.outputDirectory, 'summary.md'), 'utf8')).toContain(
      '| direct-event-loop | PASS |',
    );
    expect(await readFile(join(runnerOptions.outputDirectory, 'review.md'), 'utf8')).toContain(
      '### Agent 最终结果',
    );
    const reviewCsv = await readFile(
      join(runnerOptions.outputDirectory, 'human-review.csv'),
      'utf8',
    );
    expect(reviewCsv).toContain('Agent结果');
    expect(reviewCsv).toContain('回答');
  });

  it('best-effort reads persisted detail and cleans up after a chat failure', async () => {
    const api = fakeApi({ chatError: new Error('流中断') });
    const report = await runEvaluation(await options(), { api });
    expect(report.cases[0]).toMatchObject({ hardPassed: false, answer: '回答', error: '流中断' });
    expect(api.getSession).toHaveBeenCalledOnce();
    expect(api.deleteSession).toHaveBeenCalledOnce();
  });

  it('keeps sessions when requested', async () => {
    const api = fakeApi();
    await runEvaluation(await options({ keepSessions: true }), { api });
    expect(api.deleteSession).not.toHaveBeenCalled();
  });

  it('records cleanup failure without replacing the agent result', async () => {
    const api = fakeApi({ deleteError: new Error('删除失败') });
    const report = await runEvaluation(await options(), { api });
    expect(report.cases[0]).toMatchObject({ hardPassed: true, cleanupError: '删除失败' });
    expect(report.summary.cleanupErrors).toBe(1);
  });

  it('records judge failure as advisory and still cleans up', async () => {
    const api = fakeApi();
    const judge = {
      evaluate: vi.fn(async () => {
        throw new Error('Judge 不可用');
      }),
    };
    const report = await runEvaluation(await options({ skipJudge: false }), {
      api,
      judge: judge as never,
    });
    expect(report.cases[0]).toMatchObject({ hardPassed: true, judgeError: 'Judge 不可用' });
    expect(api.deleteSession).toHaveBeenCalledOnce();
  });
});
