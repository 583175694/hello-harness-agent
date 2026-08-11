import OpenAI from 'openai';
import type { ResearchSourceSnapshot, ToolExecutionSnapshot } from '@harness/agent-protocol';
import { semanticJudgeResultSchema } from './schemas.js';
import type { ResearchEvalCase, SemanticJudgeResult } from './types.js';

export type JudgeProfile = {
  baseUrl?: string;
  apiKey: string;
  model: string;
  source: 'eval' | 'main';
  endpointLabel: string;
};

// 优先读取独立 Judge 配置，缺失时复用主模型配置。
export function resolveJudgeProfile(env: NodeJS.ProcessEnv = process.env): JudgeProfile {
  const evalKey = env.EVAL_JUDGE_API_KEY?.trim();
  const apiKey = evalKey || env.OPENAI_API_KEY?.trim();
  const model = (evalKey ? env.EVAL_JUDGE_MODEL : undefined)?.trim() || env.OPENAI_MODEL?.trim();
  const baseUrl =
    (evalKey ? env.EVAL_JUDGE_BASE_URL : undefined)?.trim() || env.OPENAI_BASE_URL?.trim();
  if (!apiKey || !model)
    throw new Error('未配置评审模型，请设置 EVAL_JUDGE_* 或 OPENAI_API_KEY/OPENAI_MODEL。');
  return {
    apiKey,
    model,
    ...(baseUrl ? { baseUrl } : {}),
    source: evalKey ? 'eval' : 'main',
    endpointLabel: safeEndpointLabel(baseUrl),
  };
}

export class SemanticJudge {
  private readonly client: OpenAI;

  constructor(readonly profile: JudgeProfile) {
    this.client = new OpenAI({
      apiKey: profile.apiKey,
      ...(profile.baseUrl ? { baseURL: profile.baseUrl } : {}),
    });
  }

  // 使用有界已读原文评估答案，最多进行一次 JSON 格式修复。
  async evaluate(input: {
    testCase: ResearchEvalCase;
    answer: string;
    sources: ResearchSourceSnapshot[];
    executions: ToolExecutionSnapshot[];
    signal?: AbortSignal;
  }): Promise<SemanticJudgeResult> {
    const fetched = input.sources
      .filter((source) => source.kind === 'fetched')
      .map((source) => ({
        id: source.id,
        title: source.title,
        url: source.finalUrl,
        retrievedAt: source.retrievedAt,
        passages: source.passages.map((passage) => ({
          passageId: passage.passageId,
          text: passage.text,
          sectionPath: passage.locator.sectionPath,
        })),
      }));
    const payload = {
      question: input.testCase.prompt,
      expectations: input.testCase.expectations,
      answer: input.answer,
      fetchedSources: fetched,
      executions: input.executions.map((execution) => ({
        toolName: execution.toolName,
        status: execution.status,
        durationMs: execution.durationMs,
        resultCount: execution.resultCount,
        succeededCount: execution.succeededCount,
        failedCount: execution.failedCount,
        skippedCount: execution.skippedCount,
      })),
    };
    const first = await this.complete(this.prompt(JSON.stringify(payload)), input.signal);
    const parsed = this.parse(first);
    if (parsed) return parsed;
    const repaired = await this.complete(
      `下面内容没有通过 JSON Schema 校验。只修复格式和字段，不改变原评分；仅输出 JSON。\n\n${first}`,
      input.signal,
    );
    const second = this.parse(repaired);
    if (!second) throw new Error('评审模型连续两次没有返回合法结构化 JSON。');
    return second;
  }

  // 调用 OpenAI-compatible Chat Completions 获取评审文本。
  protected async complete(prompt: string, signal?: AbortSignal): Promise<string> {
    const response = await this.client.chat.completions.create(
      {
        model: this.profile.model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              '你是离线质量评审器。不得联网，不得使用未提供的知识补充事实，只能依据用户问题、Rubric、最终回答和 fetched passages 评分。搜索摘要不属于证据。',
          },
          { role: 'user', content: prompt },
        ],
      },
      { signal },
    );
    return response.choices[0]?.message.content ?? '';
  }

  // 从兼容 Markdown code fence 的模型输出中解析并校验 Judge JSON。
  private parse(content: string): SemanticJudgeResult | undefined {
    const normalized = content
      .trim()
      .replace(/^```(?:json)?\s*/iu, '')
      .replace(/\s*```$/u, '');
    try {
      const parsed: unknown = JSON.parse(normalized);
      const result = semanticJudgeResultSchema.safeParse(parsed);
      return result.success ? result.data : undefined;
    } catch {
      return undefined;
    }
  }

  // 构造固定评分说明，避免 Judge 自行发明维度或访问外部内容。
  private prompt(payload: string): string {
    return `请按 1-5 分评估 taskCompletion、sourceQuality、groundedness、sourceRelevance、limitationHandling、executionEfficiency。\ngroundedness.claims 必须列出回答中的关键事实及 supported、partially_supported、unsupported、contradicted 状态。\noverallScore 范围 1-5；verdict 只能是 pass、limited_pass、fail。\n只输出满足以下字段的 JSON：taskCompletion/sourceQuality/sourceRelevance/limitationHandling/executionEfficiency={score,reason}；groundedness={score,reason,claims:[{claim,status,sourceIds,reason}]}；overallScore；verdict；reviewReasons。\n\n评测材料：${payload}`;
  }
}

// 只记录 endpoint 主机和路径，不保存密钥或查询参数。
function safeEndpointLabel(baseUrl?: string): string {
  if (!baseUrl) return 'api.openai.com/v1';
  try {
    const url = new URL(baseUrl);
    return `${url.host}${url.pathname}`.replace(/\/$/u, '');
  } catch {
    return 'custom-openai-compatible-endpoint';
  }
}
