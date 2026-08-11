import { describe, expect, it } from 'vitest';
import { resolveJudgeProfile, SemanticJudge } from '../src/judge.js';
import { selectCases } from '../src/cases.js';

const valid = JSON.stringify({
  taskCompletion: { score: 4, reason: '完成主要任务' },
  sourceQuality: { score: 4, reason: '来源可靠' },
  groundedness: { score: 4, reason: '主要结论有依据', claims: [] },
  sourceRelevance: { score: 4, reason: '来源相关' },
  limitationHandling: { score: 3, reason: '限制说明一般' },
  executionEfficiency: { score: 4, reason: '调用合理' },
  overallScore: 3.8,
  verdict: 'limited_pass',
  reviewReasons: ['人工检查限制说明'],
});

class FakeJudge extends SemanticJudge {
  readonly prompts: string[] = [];
  constructor(private readonly responses: string[]) {
    super({ apiKey: 'test', model: 'judge', source: 'eval', endpointLabel: 'test' });
  }
  protected override async complete(prompt: string): Promise<string> {
    this.prompts.push(prompt);
    return this.responses.shift() ?? '';
  }
}

describe('SemanticJudge', () => {
  it('repairs one invalid JSON response', async () => {
    const judge = new FakeJudge(['not json', valid]);
    const result = await judge.evaluate({
      testCase: selectCases('smoke')[0]!,
      answer: '回答',
      sources: [],
      executions: [],
    });
    expect(result.overallScore).toBe(3.8);
    expect(judge.prompts).toHaveLength(2);
  });

  it('falls back to the main model configuration', () => {
    expect(resolveJudgeProfile({ OPENAI_API_KEY: 'key', OPENAI_MODEL: 'model' })).toMatchObject({
      source: 'main',
      model: 'model',
      endpointLabel: 'api.openai.com/v1',
    });
  });

  it('uses the independent judge configuration when it is complete', () => {
    expect(
      resolveJudgeProfile({
        EVAL_JUDGE_API_KEY: 'judge-key',
        EVAL_JUDGE_MODEL: 'judge-model',
        EVAL_JUDGE_BASE_URL: 'https://judge.example/v1?secret=hidden',
        OPENAI_API_KEY: 'main-key',
        OPENAI_MODEL: 'main-model',
      }),
    ).toMatchObject({
      source: 'eval',
      model: 'judge-model',
      endpointLabel: 'judge.example/v1',
    });
  });

  it('reports an error after two invalid structured responses', async () => {
    const judge = new FakeJudge(['not json', 'still not json']);
    await expect(
      judge.evaluate({
        testCase: selectCases('smoke')[0]!,
        answer: '回答',
        sources: [],
        executions: [],
      }),
    ).rejects.toThrow('连续两次');
  });
});
