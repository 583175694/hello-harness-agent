import OpenAI from 'openai';
import { z } from 'zod';
import type { ContextJudge } from './scenario-runner.js';

const resultSchema = z.object({
  taskCompletion: z.number().int().min(1).max(5),
  constraintFollowing: z.number().int().min(1).max(5),
  evidenceGroundedness: z.number().int().min(1).max(5),
  qualificationPreservation: z.number().int().min(1).max(5),
  goalCoherence: z.number().int().min(1).max(5),
  verdict: z.enum(['pass', 'fail', 'unknown']),
  reason: z.string().min(1),
});

export function createContextJudgeFromEnvironment(): ContextJudge {
  const apiKey = process.env.EVAL_JUDGE_API_KEY ?? process.env.OPENAI_API_KEY;
  const model = process.env.EVAL_JUDGE_MODEL ?? process.env.OPENAI_MODEL;
  const baseURL = process.env.EVAL_JUDGE_BASE_URL ?? process.env.OPENAI_BASE_URL;
  if (!apiKey || !model)
    throw new Error(
      'Context Judge 未配置。请设置 EVAL_JUDGE_API_KEY/EVAL_JUDGE_MODEL，或显式使用 --skip-judge。',
    );
  const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  const judge: ContextJudge = async ({ task, answer, runs }) => {
    const evidenceCandidates = runs
      .flatMap((run) => run.snapshot.sources)
      .filter((source) => source.kind === 'fetched')
      .flatMap((source) =>
        source.passages.map((passage) => ({
          id: passage.passageId,
          text: passage.text.slice(0, 2_000),
        })),
      )
      .slice(0, 12);
    let evidenceCharacters = 0;
    const evidence = evidenceCandidates.filter((item) => {
      if (evidenceCharacters >= 16_000) return false;
      item.text = item.text.slice(0, 16_000 - evidenceCharacters);
      evidenceCharacters += item.text.length;
      return Boolean(item.text);
    });
    const judgeInput = {
      promptVersion: 'context-judge-v1',
      task: {
        id: task.id,
        capability: task.capability,
        pressure: task.pressure,
        expectations: task.expectations,
        scenario: task.scenario.map((step) => ({
          type: step.type,
          content: boundedScenarioContent(step.content),
        })),
      },
      answer: answer.slice(0, 20_000),
      evidence,
      trace: runs.map((run) => ({
        status: run.snapshot.status,
        toolCallCount: run.snapshot.toolCallCount,
        executions: run.snapshot.executions.map((execution) => ({
          toolName: execution.toolName,
          status: execution.status,
          errorCode: execution.error?.code,
        })),
      })),
    };
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content:
          '你是离线 Context Eval Judge，不得联网。只根据 Task、回答、Trace 和给定 Evidence 输出 JSON。证据不足时 verdict=unknown。',
      },
      { role: 'user', content: JSON.stringify(judgeInput) },
    ];
    let promptTokens = 0;
    let completionTokens = 0;
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const response = await client.chat.completions.create({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages,
      });
      promptTokens += response.usage?.prompt_tokens ?? 0;
      completionTokens += response.usage?.completion_tokens ?? 0;
      const raw = response.choices[0]?.message.content ?? '';
      try {
        return {
          ...resultSchema.parse(JSON.parse(raw)),
          usage: { promptTokens, completionTokens },
        };
      } catch (error) {
        lastError = error;
        if (attempt === 1) {
          messages.push(
            { role: 'assistant', content: raw.slice(0, 8_000) },
            {
              role: 'user',
              content:
                '上一个输出不是合法的 Context Judge JSON。请只修复格式并严格返回要求的字段。',
            },
          );
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Context Judge 返回无效 JSON。');
  };
  judge.profile = {
    model,
    endpoint: endpointLabel(baseURL),
  };
  return judge;
}

function boundedScenarioContent(content: string): string {
  if (content.length <= 2_000) return content;
  return `${content.slice(0, 1_000)}\n…[省略 ${content.length - 2_000} 字压力材料]…\n${content.slice(-1_000)}`;
}

function endpointLabel(baseURL?: string): string {
  if (!baseURL) return 'api.openai.com';
  try {
    const url = new URL(baseURL);
    return `${url.host}${url.pathname}`.replace(/\/$/u, '');
  } catch {
    return 'custom-endpoint';
  }
}
