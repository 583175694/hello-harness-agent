import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DeepSeekTokenizer } from '@harness/deepseek-tokenizer';
import { CONTEXT_CORE_V1, selectContextTasks } from '../src/context/cases.js';
import { bootstrapPassRate, summarizePasses } from '../src/context/statistics.js';
import { parseContextCliArguments } from '../src/context/cli.js';
import { gradeContextTrial } from '../src/context/graders.js';
import { calibrateContextJudge, parseCsv } from '../src/context/calibration.js';
import { createContextJudgeFromEnvironment } from '../src/context/judge.js';
import { compareContextReports } from '../src/context/report.js';
import type { ContextExperimentReport } from '../src/context/types.js';

describe('context-core-v1', () => {
  it('freezes twenty uniquely identified tasks with the expected capability mix', () => {
    expect(CONTEXT_CORE_V1).toHaveLength(20);
    expect(new Set(CONTEXT_CORE_V1.map((task) => task.id)).size).toBe(20);
    expect(
      Object.fromEntries(
        [...new Set(CONTEXT_CORE_V1.map((task) => task.capability))].map((capability) => [
          capability,
          CONTEXT_CORE_V1.filter((task) => task.capability === capability).length,
        ]),
      ),
    ).toEqual({
      constraint_retention: 5,
      context_pollution: 3,
      evidence_fidelity: 5,
      long_agent_loop: 3,
      connection_durability: 2,
      short_regression: 2,
    });
    expect(selectContextTasks({ smoke: true }).every((task) => task.smoke)).toBe(true);
  });

  it('uses stable pass@k, pass^k and bootstrap calculations', () => {
    expect(
      summarizePasses([
        { taskId: 'a', passed: true },
        { taskId: 'a', passed: false },
        { taskId: 'b', passed: true },
        { taskId: 'b', passed: true },
      ]),
    ).toEqual({ passAtK: 1, passPowerK: 0.5 });
    expect(bootstrapPassRate([true, false, true], 42, 1_000)).toEqual(
      bootstrapPassRate([true, false, true], 42, 1_000),
    );
  });

  it('locks CLI mode defaults and explicit filters', () => {
    expect(parseContextCliArguments(['--mode', 'full', '--pressure', 'L'])).toMatchObject({
      mode: 'full',
      trials: 3,
      pressure: 'L',
    });
    expect(parseContextCliArguments(['--mode', 'baseline'])).toMatchObject({
      mode: 'baseline',
      trials: 5,
    });
  });

  it('does not hide duplicate SSE events before reconnect grading', () => {
    const task = CONTEXT_CORE_V1.find((item) => item.id === 'connection-replay-after-start')!;
    const duplicate = {
      version: '0.11.0',
      eventId: 'duplicate-event',
      seq: 1,
      sessionId: 'session',
      runId: 'run',
      type: 'run.started',
      occurredAt: '2026-08-15T00:00:00.000Z',
      payload: { status: 'running' },
    } as const;
    const rules = gradeContextTrial(
      task,
      '服务器推送事件',
      [
        {
          runId: 'run',
          requestStartedAt: '2026-08-15T00:00:00.000Z',
          events: [
            { event: duplicate, receivedAt: '2026-08-15T00:00:00.100Z' },
            { event: duplicate, receivedAt: '2026-08-15T00:00:00.200Z' },
          ],
          snapshot: {
            status: 'completed',
            assistantContent: '服务器推送事件',
            toolCallCount: 0,
          },
          disconnected: true,
          reconnectCursor: 1,
          reconnect: {
            expectedEventType: 'run.started',
            disconnectObserved: true,
            firstConnectionEventCount: 1,
            duplicateEventIds: ['duplicate-event'],
          },
        } as never,
      ],
      131_072,
      1_000,
    );
    expect(rules.find((rule) => rule.id.startsWith('trace-reconnect-no-duplicate'))).toMatchObject({
      passed: false,
      critical: true,
    });
  });

  it('parses multiline human review CSV and computes judge calibration', async () => {
    expect(parseCsv('a,b\n"line 1\nline 2",x\n')).toEqual([
      ['a', 'b'],
      ['line 1\nline 2', 'x'],
    ]);
    const directory = await mkdtemp(join(tmpdir(), 'context-calibration-'));
    try {
      const input = join(directory, 'human-review.csv');
      await writeFile(
        input,
        'judgeVerdict,人工结论,answer\npass,通过,"line 1\nline 2"\nfail,失败,answer\n',
      );
      const report = await calibrateContextJudge(input);
      expect(report).toMatchObject({
        labeled: 2,
        agreement: 1,
        cohenKappa: 1,
        severeFalsePasses: 0,
        calibrated: true,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('requires an explicit Judge configuration unless --skip-judge is used', () => {
    const previous = {
      key: process.env.EVAL_JUDGE_API_KEY,
      model: process.env.EVAL_JUDGE_MODEL,
      fallbackKey: process.env.OPENAI_API_KEY,
      fallbackModel: process.env.OPENAI_MODEL,
    };
    delete process.env.EVAL_JUDGE_API_KEY;
    delete process.env.EVAL_JUDGE_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    try {
      expect(() => createContextJudgeFromEnvironment()).toThrow('Context Judge 未配置');
    } finally {
      if (previous.key) process.env.EVAL_JUDGE_API_KEY = previous.key;
      if (previous.model) process.env.EVAL_JUDGE_MODEL = previous.model;
      if (previous.fallbackKey) process.env.OPENAI_API_KEY = previous.fallbackKey;
      if (previous.fallbackModel) process.env.OPENAI_MODEL = previous.fallbackModel;
    }
  });

  it('compares aligned experiments and rejects incompatible baselines', () => {
    const baseline = comparisonReport('baseline', 0.5, 100);
    const candidate = comparisonReport('candidate', 0.75, 80);
    expect(compareContextReports(candidate, baseline)).toMatchObject({
      compared: true,
      passRateDelta: 0.25,
      metricDeltas: { estimatedPromptTokens: -20 },
    });
    expect(() =>
      compareContextReports({ ...candidate, benchmarkHash: 'different-benchmark' }, baseline),
    ).toThrow('benchmarkHash 不一致');
    expect(() =>
      compareContextReports(
        {
          ...candidate,
          modelContextProfile: { ...candidate.modelContextProfile, verified: true },
        },
        baseline,
      ),
    ).toThrow('Model Context Profile 不一致');
  });
});

function comparisonReport(
  experimentId: string,
  passRate: number,
  estimatedPromptTokens: number,
): ContextExperimentReport {
  return {
    experimentId,
    benchmarkVersion: 'context-core-v1',
    benchmarkHash: 'benchmark',
    graderVersion: 'context-graders-v1',
    fixtureHash: 'fixture',
    model: 'deepseek-v4-flash',
    reasoningEffort: 'high',
    systemPromptHash: 'system',
    toolSchemaHash: 'tools',
    judgeProfile: { enabled: false, promptVersion: 'context-judge-v1' },
    startedAt: '2026-08-15T00:00:00.000Z',
    completedAt: '2026-08-15T00:01:00.000Z',
    seed: 42,
    trialsPerTask: 1,
    modelContextProfile: {
      contextWindowTokens: 131_072,
      maxOutputTokens: 8_192,
      tokenizer: 'deepseek-v3',
      source: 'test',
      verified: false,
    },
    trials: [],
    summary: {
      tasks: 0,
      trials: 0,
      passed: 0,
      passRate,
      passAtK: passRate,
      passPowerK: passRate,
      criticalViolations: 0,
      bootstrap95: { low: passRate, high: passRate },
      groups: [],
      metrics: {
        promptTokens: null,
        completionTokens: null,
        cachedTokens: null,
        estimatedPromptTokens,
        peakPromptTokens: null,
        peakEstimatedPromptTokens: 0,
        maxPressureRatio: 0,
        maxPlannedPressureRatio: 0,
        modelRounds: 0,
        toolCalls: 0,
        duplicateToolCalls: 0,
        averageTtftMs: null,
        durationMs: 0,
        judgePromptTokens: 0,
        judgeCompletionTokens: 0,
        judgeErrors: 0,
      },
    },
  };
}

const workspace = join(dirname(fileURLToPath(import.meta.url)), '../../..');
describe('DeepSeek TypeScript tokenizer', () => {
  it('matches Python Transformers golden token IDs', async () => {
    const tokenizer = await DeepSeekTokenizer.load();
    const golden = JSON.parse(
      await readFile(
        join(workspace, 'packages/agent-evals/fixtures/tokenizer/deepseek-v3-golden.json'),
        'utf8',
      ),
    ) as Array<{ text: string; ids: number[]; count: number }>;
    for (const vector of golden) {
      expect(tokenizer.encode(vector.text)).toEqual(vector.ids);
      expect(tokenizer.count(vector.text)).toBe(vector.count);
    }
  });

  it('materially reaches the declared S/M/L/X pressure bands', async () => {
    const tokenizer = await DeepSeekTokenizer.load();
    const expected = {
      S: [0.04, 0.15],
      M: [0.35, 0.6],
      L: [0.7, 0.9],
      X: [1, Number.POSITIVE_INFINITY],
    } as const;
    for (const pressure of ['S', 'M', 'L', 'X'] as const) {
      const tasks = CONTEXT_CORE_V1.filter(
        (task) =>
          task.pressure === pressure &&
          task.capability !== 'connection_durability' &&
          task.capability !== 'short_regression',
      );
      for (const task of tasks) {
        const tokens = tokenizer.count(task.scenario.map((step) => step.content).join('\n'));
        const ratio = tokens / 131_072;
        expect(ratio, task.id).toBeGreaterThanOrEqual(expected[pressure][0]);
        expect(ratio, task.id).toBeLessThanOrEqual(expected[pressure][1]);
      }
    }
  }, 20_000);
});
