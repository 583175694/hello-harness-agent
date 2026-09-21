import { AGENT_PROTOCOL_LIMITS, AGENT_TOOL_NAMES } from '@harness/agent-protocol';

export const OUTPUT_LIMIT_RETRY_HINTS = {
  truncatedToolCall:
    '上一轮工具调用因输出预算被截断，参数不完整，已丢弃。请缩短 create_report 或 create_file 正文后重新提交，或基于已有材料给出较短最终回答。思考中不要复述全部原始数据。',
  truncatedFinalAnswer:
    '上一轮最终回答因输出预算被截断，未保存。请给出更短且完整的最终回答，不要重复已展示的长文。',
  truncatedReasoningOnly:
    '上一轮思考耗尽了输出预算，没有完成交付。请停止展开推理，直接用较短最终回答或精炼 create_report 完成任务。',
} as const;

export type RecoverableToolCall = {
  name: string;
  arguments: string;
};

export type OutputLimitRecovery<T extends RecoverableToolCall> =
  | { kind: 'proceed'; calls: T[]; anySalvaged: boolean }
  | { kind: 'retry'; hint: string };

export function recoverTruncatedModelRound<T extends RecoverableToolCall>(input: {
  calls: T[];
  hasText: boolean;
  finalResponseOnly: boolean;
}): OutputLimitRecovery<T> {
  if (input.calls.length === 0) {
    return {
      kind: 'retry',
      hint:
        input.finalResponseOnly || input.hasText
          ? OUTPUT_LIMIT_RETRY_HINTS.truncatedFinalAnswer
          : OUTPUT_LIMIT_RETRY_HINTS.truncatedReasoningOnly,
    };
  }
  let usable = 0;
  let anySalvaged = false;
  const calls = input.calls.map((call) => {
    const recovered = recoverToolCallArguments(call.name, call.arguments);
    if (!recovered) return call;
    usable += 1;
    if (recovered.salvaged) anySalvaged = true;
    return { ...call, arguments: recovered.arguments };
  });
  if (usable === 0) {
    return { kind: 'retry', hint: OUTPUT_LIMIT_RETRY_HINTS.truncatedToolCall };
  }
  return { kind: 'proceed', calls, anySalvaged };
}

export function recoverToolCallArguments(
  toolName: string,
  raw: string,
): { arguments: string; salvaged: boolean } | null {
  try {
    JSON.parse(raw);
    return { arguments: raw, salvaged: false };
  } catch {
    if (toolName !== AGENT_TOOL_NAMES.createReport && toolName !== AGENT_TOOL_NAMES.createFile) {
      return null;
    }
    const salvaged = salvageGeneratedFileArguments(toolName, raw);
    return salvaged ? { arguments: salvaged, salvaged: true } : null;
  }
}

export function closeTruncatedJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Truncated payloads are expected; try to close the object below.
  }
  let text = raw.trim();
  if (!text.startsWith('{')) return null;
  if (/\\u[0-9a-fA-F]{0,3}$/.test(text)) text = text.replace(/\\u[0-9a-fA-F]{0,3}$/, '');
  if (text.endsWith('\\') && !text.endsWith('\\\\')) text = text.slice(0, -1);

  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  for (const ch of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  if (escaped) text = text.slice(0, -1);
  const closed = `${text.replace(/,\s*$/, '')}${inString ? '"' : ''}${[...stack].reverse().join('')}`;
  try {
    const parsed = JSON.parse(closed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function salvageGeneratedFileArguments(toolName: string, raw: string): string | null {
  const parsed = closeTruncatedJsonObject(raw);
  if (!parsed) return null;
  if (toolName === AGENT_TOOL_NAMES.createReport) {
    const title = asNonEmptyString(parsed.title);
    const summary = asNonEmptyString(parsed.summary);
    const fileName = asNonEmptyString(parsed.fileName);
    const content =
      typeof parsed.content === 'string'
        ? trimToCodePoints(parsed.content, AGENT_PROTOCOL_LIMITS.createReportMaxCodePoints)
        : '';
    if (!title || !summary || !fileName || !content || !/\.md$/iu.test(fileName)) return null;
    return JSON.stringify({
      title,
      summary,
      fileName,
      content,
      ...(Array.isArray(parsed.sourceIds) ? { sourceIds: parsed.sourceIds } : {}),
      ...(Array.isArray(parsed.fileIds) ? { fileIds: parsed.fileIds } : {}),
    });
  }
  const fileName = asNonEmptyString(parsed.fileName);
  if (!fileName) return null;
  if (typeof parsed.content === 'string' && parsed.content.trim()) {
    const content = trimToCodePoints(
      parsed.content,
      AGENT_PROTOCOL_LIMITS.generatedFileMaxCodePoints,
    );
    if (!content) return null;
    return JSON.stringify({ fileName, content });
  }
  if (Array.isArray(parsed.sheets) && parsed.sheets.length) {
    return JSON.stringify({ fileName, sheets: parsed.sheets });
  }
  return null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function trimToCodePoints(text: string, max: number): string {
  const chars = [...text];
  const sliced = chars.length <= max ? text : chars.slice(0, max).join('');
  const breakAt = Math.max(sliced.lastIndexOf('\n\n'), sliced.lastIndexOf('\n'));
  const kept = chars.length > max && breakAt >= max * 0.6 ? sliced.slice(0, breakAt) : sliced;
  return kept.trimEnd();
}
