import { assistantAgentMetadataSchema } from '@harness/agent-protocol';
import type {
  AssistantAgentMetadata,
  ChatStreamEvent,
  SessionDetail,
} from '@harness/agent-protocol';
import { EvalApiClient } from './api-client.js';
import { analyzeCase, collectMetrics } from './analyzer.js';
import { selectCases } from './cases.js';
import type { JudgeProfile, SemanticJudge } from './judge.js';
import { writeReport } from './report.js';
import type { EvalCaseResult, EvalRunReport, ResearchEvalCase } from './types.js';

export type EvalRunnerOptions = {
  suite: 'smoke' | 'full';
  caseId?: string;
  keepSessions: boolean;
  skipJudge: boolean;
  apiBaseUrl: string;
  outputDirectory: string;
  command: string[];
};

export type EvalRunnerDependencies = {
  api?: Pick<
    EvalApiClient,
    'assertReady' | 'createSession' | 'runChat' | 'getSession' | 'deleteSession'
  >;
  judge?: SemanticJudge;
  judgeProfile?: JudgeProfile;
};

// 串行运行真实题集并确保每道题进入独立 Session 和清理边界。
export async function runEvaluation(
  options: EvalRunnerOptions,
  dependencies: EvalRunnerDependencies = {},
): Promise<EvalRunReport> {
  const api = dependencies.api ?? new EvalApiClient(options.apiBaseUrl);
  await api.assertReady(AbortSignal.timeout(10_000));
  const cases = selectCases(options.suite, options.caseId);
  const startedAt = new Date();
  const runId = compactRunId(startedAt);
  const results: EvalCaseResult[] = [];
  for (const testCase of cases) {
    results.push(await runCase(testCase, options, api, dependencies.judge));
  }
  const completedAt = new Date();
  const judged = results.flatMap((item) => (item.judge ? [item.judge.overallScore] : []));
  const report: EvalRunReport = {
    runId,
    suite: options.suite,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    cases: results,
    hardPassed: results.every((item) => item.hardPassed),
    summary: {
      total: results.length,
      completed: results.filter((item) => item.answer).length,
      hardPassed: results.filter((item) => item.hardPassed).length,
      hardFailed: results.filter((item) => !item.hardPassed).length,
      judgeErrors: results.filter((item) => item.judgeError).length,
      cleanupErrors: results.filter((item) => item.cleanupError).length,
      ...(judged.length
        ? { averageJudgeScore: judged.reduce((sum, score) => sum + score, 0) / judged.length }
        : {}),
    },
  };
  await writeReport(options.outputDirectory, report, {
    judgeProfile: dependencies.judgeProfile,
    command: options.command,
  });
  return report;
}

// 执行单题、采集持久化事实、评分并在 finally 中清理临时 Session。
async function runCase(
  testCase: ResearchEvalCase,
  options: EvalRunnerOptions,
  api: Pick<EvalApiClient, 'createSession' | 'runChat' | 'getSession' | 'deleteSession'>,
  judge?: SemanticJudge,
): Promise<EvalCaseResult> {
  const startedAt = new Date();
  let sessionId: string | undefined;
  let events: ChatStreamEvent[] = [];
  let session: SessionDetail | undefined;
  let result: EvalCaseResult;
  try {
    sessionId = await api.createSession(evalSessionTitle(testCase.id), AbortSignal.timeout(10_000));
    events = await api.runChat(
      sessionId,
      testCase.prompt,
      AbortSignal.timeout(testCase.expectations.maxDurationMs),
    );
    session = await api.getSession(sessionId, AbortSignal.timeout(10_000));
    const completedAt = new Date();
    const analysis = analyzeCase(
      testCase,
      events,
      session,
      completedAt.getTime() - startedAt.getTime(),
    );
    result = {
      caseId: testCase.id,
      category: testCase.category,
      prompt: testCase.prompt,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      sessionId,
      model: analysis.model,
      provider: analysis.provider,
      answer: analysis.answer,
      events,
      executions: analysis.executions,
      sources: analysis.sources,
      hardRules: analysis.rules,
      hardPassed: analysis.rules.every((rule) => rule.passed),
      metrics: analysis.metrics,
    };
    if (!options.skipJudge && judge && result.answer) {
      try {
        result.judge = await judge.evaluate({
          testCase,
          answer: result.answer,
          sources: result.sources,
          executions: result.executions,
          signal: AbortSignal.timeout(60_000),
        });
      } catch (error) {
        result.judgeError = describeError(error);
      }
    }
  } catch (error) {
    if (sessionId && !session) {
      try {
        session = await api.getSession(sessionId, AbortSignal.timeout(10_000));
      } catch {
        /* 原始执行错误优先；详情读取失败不覆盖它。 */
      }
    }
    const completedAt = new Date();
    const metadata = latestMetadata(session);
    const assistant = latestAssistant(session);
    const sources = metadata?.agent?.sources ?? [];
    result = {
      caseId: testCase.id,
      category: testCase.category,
      prompt: testCase.prompt,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      ...(sessionId ? { sessionId } : {}),
      ...(assistant?.content ? { answer: assistant.content } : {}),
      ...(metadata?.model ? { model: metadata.model } : {}),
      events,
      executions: metadata?.agent?.executions ?? [],
      sources,
      hardRules: [{ id: 'case_execution', passed: false, detail: describeError(error) }],
      hardPassed: false,
      metrics: collectMetrics(events, sources),
      error: describeError(error),
    };
  }
  if (sessionId && !options.keepSessions) {
    try {
      await api.deleteSession(sessionId, AbortSignal.timeout(10_000));
    } catch (error) {
      result.cleanupError = describeError(error);
    }
  }
  return result;
}

// 生成符合生产 Session 标题上限的评测标题，runId 由报告和 Session ID 关联保存。
function evalSessionTitle(caseId: string): string {
  return `[EVAL] ${caseId}`.slice(0, 28);
}

// 从已读取的 Session 中找到最后一条持久化 assistant 消息。
function latestAssistant(session?: SessionDetail): SessionDetail['messages'][number] | undefined {
  return [...(session?.messages ?? [])].reverse().find((message) => message.role === 'assistant');
}

// 从异常路径已读取的 Session 中恢复最后一条 assistant metadata。
function latestMetadata(session?: SessionDetail): AssistantAgentMetadata | undefined {
  const assistant = latestAssistant(session);
  const parsed = assistantAgentMetadataSchema.safeParse(assistant?.metadata);
  return parsed.success ? parsed.data : undefined;
}

function compactRunId(value: Date): string {
  return value
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}Z$/u, 'Z');
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : '未知评测错误。';
}
