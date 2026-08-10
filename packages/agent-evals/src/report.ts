import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EvalCaseResult, EvalRunReport } from './types.js';
import type { JudgeProfile } from './judge.js';

// 将单次评测写为机器可读结果、Markdown 汇总和人工抽检 CSV。
export async function writeReport(
  outputDirectory: string,
  report: EvalRunReport,
  input: { judgeProfile?: JudgeProfile; command: string[] },
): Promise<void> {
  const casesDirectory = join(outputDirectory, 'cases');
  await mkdir(casesDirectory, { recursive: true });
  for (const result of report.cases) {
    await writeFile(join(casesDirectory, `${result.caseId}.json`), json(result), 'utf8');
  }
  const manifest = {
    runId: report.runId,
    suite: report.suite,
    startedAt: report.startedAt,
    completedAt: report.completedAt,
    command: input.command,
    judge: input.judgeProfile ? {
      model: input.judgeProfile.model,
      source: input.judgeProfile.source,
      endpoint: input.judgeProfile.endpointLabel,
    } : { disabled: true },
  };
  await writeFile(join(outputDirectory, 'manifest.json'), json(manifest), 'utf8');
  await writeFile(join(outputDirectory, 'summary.json'), json(report), 'utf8');
  await writeReviewArtifacts(outputDirectory, report);
}

// 生成逐题诊断 Markdown、增强人工抽检 CSV 和简洁汇总。
export async function writeReviewArtifacts(outputDirectory: string, report: EvalRunReport): Promise<void> {
  await writeFile(join(outputDirectory, 'summary.md'), markdown(report), 'utf8');
  await writeFile(join(outputDirectory, 'review.md'), detailedReview(report), 'utf8');
  await writeFile(join(outputDirectory, 'human-review.csv'), humanReviewCsv(report.cases), 'utf8');
}

// 生成适合终端和代码审查阅读的汇总及失败信息。
function markdown(report: EvalRunReport): string {
  const lines = [
    `# General Web Research Eval ${report.runId}`,
    '',
    `- Suite: ${report.suite}`,
    `- Cases: ${report.summary.total}`,
    `- Completed: ${report.summary.completed}`,
    `- Hard passed: ${report.summary.hardPassed}`,
    `- Hard failed: ${report.summary.hardFailed}`,
    `- Judge errors: ${report.summary.judgeErrors}`,
    `- Cleanup errors: ${report.summary.cleanupErrors}`,
    `- Average judge score: ${report.summary.averageJudgeScore?.toFixed(2) ?? 'N/A'}`,
    '',
    '| Case | Hard | Judge | Search | Fetch | Docs | Passages | Duration | Error |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const item of report.cases) {
    lines.push(`| ${item.caseId} | ${item.hardPassed ? 'PASS' : 'FAIL'} | ${item.judge?.overallScore ?? 'N/A'} | ${item.metrics.searchCalls} | ${item.metrics.fetchCalls} | ${item.metrics.uniqueDocuments} | ${item.metrics.passageCharacters} | ${item.durationMs}ms | ${escapeMarkdown(item.error ?? item.judgeError ?? item.cleanupError ?? '')} |`);
  }
  lines.push('', '详细诊断见 `review.md`。');
  return `${lines.join('\n')}\n`;
}

// 生成包含问题、回答、硬规则失败和工具摘要的逐题诊断文档。
function detailedReview(report: EvalRunReport): string {
  const lines = [`# General Web Research 逐题诊断 ${report.runId}`, ''];
  for (const item of report.cases) {
    lines.push(`## ${item.caseId}`, '', `- 类别：${item.category}`, `- 硬规则：${item.hardPassed ? '通过' : '失败'}`, `- 耗时：${item.durationMs}ms`, `- 模型：${item.model ?? '未知'}`, `- Provider：${item.provider ?? '无搜索 Provider'}`, '');
    lines.push('### 问题', '', item.prompt, '', '### Agent 最终结果', '', item.answer || '没有持久化 assistant 结果。', '');
    lines.push('### 自动诊断', '');
    const failed = item.hardRules.filter((rule) => !rule.passed);
    lines.push(...(failed.length ? failed.map((rule) => `- [失败] ${rule.id}：${rule.detail}`) : ['- 没有硬规则失败。']), '');
    lines.push('### 执行指标', '', `- Search 调用：${item.metrics.searchCalls}`, `- Fetch 调用：${item.metrics.fetchCalls}`, `- 网络尝试：${item.metrics.networkAttempts}`, `- 成功唯一文档：${item.metrics.uniqueDocuments}`, `- Passage 字符：${item.metrics.passageCharacters}`, `- 停止原因：${item.metrics.stopReason ?? '未触发'}`, `- 来源：clue=${item.metrics.clueSources}，fetched=${item.metrics.fetchedSources}，used=${item.metrics.usedSources}`, '');
    lines.push('### 工具执行', '');
    lines.push(...(item.executions.length ? item.executions.map((execution) => `- ${execution.toolName} / ${execution.status} / ${execution.durationMs}ms / call=${execution.toolCallId}${execution.error ? ` / ${execution.error.code}: ${execution.error.detail}` : ''}`) : ['- 没有持久化工具执行。']), '');
    lines.push('### 来源摘要', '');
    lines.push(...(item.sources.length ? item.sources.map((source) => source.kind === 'fetched'
      ? `- fetched ${source.title}：${source.finalUrl}，passages=${source.passages.length}，used=${source.used}`
      : `- clue ${source.title}：${source.url}，provider=${source.provider}，used=${source.used}`) : ['- 没有持久化来源。']), '');
    lines.push('### Judge', '');
    if (item.judge) {
      lines.push(`- 总分：${item.judge.overallScore}，结论：${item.judge.verdict}`);
      lines.push(`- 任务完成度：${item.judge.taskCompletion.score}/5，${item.judge.taskCompletion.reason}`);
      lines.push(`- 来源质量：${item.judge.sourceQuality.score}/5，${item.judge.sourceQuality.reason}`);
      lines.push(`- 事实支撑：${item.judge.groundedness.score}/5，${item.judge.groundedness.reason}`);
      lines.push(...item.judge.reviewReasons.map((reason) => `- 评审原因：${reason}`));
    } else lines.push(`- 未得到 Judge 结果${item.judgeError ? `：${item.judgeError}` : '。'}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

// 选择全部风险任务和稳定类别样本，生成包含自动诊断的人工抽检表。
function humanReviewCsv(results: EvalCaseResult[]): string {
  const risky = results.filter((item) => !item.hardPassed || item.judge?.verdict !== 'pass');
  const byCategory = new Map<string, EvalCaseResult>();
  for (const item of [...results].sort((left, right) => left.caseId.localeCompare(right.caseId))) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, item);
  }
  const selected = new Map([...risky, ...byCategory.values()].map((item) => [item.caseId, item]));
  for (const item of [...results].sort((left, right) => stableNumber(left.caseId) - stableNumber(right.caseId))) {
    if (selected.size >= Math.min(20, results.length)) break;
    selected.set(item.caseId, item);
  }
  // 保留人工字段，同时将可由程序确定的上下文直接放进 CSV。
  const header = ['caseId', 'category', 'hardPassed', 'judgeScore', 'judgeVerdict', '问题', 'Agent结果', '自动失败原因', '执行指标', '来源摘要', 'Judge评语', 'Judge错误', '耗时ms', '人工任务完成度', '人工来源质量', '人工事实支撑', '人工来源覆盖', '人工限制说明', '人工执行效率', '人工重大问题', '人工最终结论', '人工备注'];
  const rows = [...selected.values()].map((item) => [
    item.caseId, item.category, String(item.hardPassed), String(item.judge?.overallScore ?? ''), item.judge?.verdict ?? '',
    item.prompt, item.answer ?? '', item.hardRules.filter((rule) => !rule.passed).map((rule) => `${rule.id}: ${rule.detail}`).join(' | '),
    compactJson(item.metrics), compactJson(item.sources.map((source) => source.kind === 'fetched'
      ? { kind: source.kind, title: source.title, url: source.finalUrl, passages: source.passages.length, used: source.used }
      : { kind: source.kind, title: source.title, url: source.url, used: source.used })),
    item.judge?.reviewReasons.join(' | ') ?? '', item.judgeError ?? '', String(item.durationMs),
    '', '', '', '', '', '', '', '', '',
  ]);
  return `${[header, ...rows].map((row) => row.map(csv).join(',')).join('\n')}\n`;
}

// 生成稳定抽样顺序，避免每次运行人工样本随机变化。
function stableNumber(value: string): number {
  return [...value].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 0);
}

function csv(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

// 将结构化指标压成单行，避免 CSV 自动换行破坏阅读。
function compactJson(value: unknown): string {
  return JSON.stringify(value);
}

function escapeMarkdown(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}
