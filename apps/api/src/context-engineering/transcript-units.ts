import type { ModelMessage } from '../model/model-adapter';

export type TranscriptUnitKind = 'plain' | 'tool_batch' | 'user' | 'system';

export type TranscriptUnit = {
  messages: ModelMessage[];
  kind: TranscriptUnitKind;
  declaredCallIds?: string[];
};

/** 将 history 切成不可拆分的 transcript 单元（assistant 工具批 + 连续 tool 同属一批）。 */
export function buildTranscriptUnits(history: ModelMessage[]): TranscriptUnit[] {
  const units: TranscriptUnit[] = [];
  for (let index = 0; index < history.length; index += 1) {
    const message = history[index]!;
    if (message.role === 'assistant' && message.toolCalls?.length) {
      const declaredCallIds = message.toolCalls.map((call) => call.id);
      const pending = new Set(declaredCallIds);
      const batch: ModelMessage[] = [message];
      while (index + 1 < history.length && history[index + 1]?.role === 'tool') {
        const result = history[++index]!;
        batch.push(result);
        if (result.role === 'tool') pending.delete(result.toolCallId);
        if (pending.size === 0) break;
      }
      units.push({ messages: batch, kind: 'tool_batch', declaredCallIds });
      continue;
    }
    if (message.role === 'user') {
      units.push({ messages: [message], kind: 'user' });
      continue;
    }
    if (message.role === 'system') {
      units.push({ messages: [message], kind: 'system' });
      continue;
    }
    units.push({ messages: [message], kind: 'plain' });
  }
  return units;
}

export function unitBoundaryMessageCount(units: TranscriptUnit[], unitIndex: number): number {
  let count = 0;
  for (let index = 0; index < unitIndex && index < units.length; index += 1) {
    count += units[index]!.messages.length;
  }
  return count;
}

/** 若 messageCount 落在某 unit 内部，下调到该 unit 起点，避免 suffix 从 orphan tool 开头。 */
export function alignCoveredCountToUnitBoundary(
  units: TranscriptUnit[],
  messageCount: number,
): number {
  if (messageCount <= 0) return 0;
  let offset = 0;
  for (const unit of units) {
    const start = offset;
    const end = offset + unit.messages.length;
    if (messageCount <= start) return start;
    if (messageCount > start && messageCount < end) return start;
    offset = end;
  }
  return Math.min(messageCount, offset);
}

export function isCompleteToolBatch(unit: TranscriptUnit): boolean {
  if (unit.kind !== 'tool_batch' || !unit.declaredCallIds?.length) return true;
  const pending = new Set(unit.declaredCallIds);
  for (const message of unit.messages) {
    if (message.role === 'tool') pending.delete(message.toolCallId);
  }
  return pending.size === 0;
}

export function flattenUnits(units: TranscriptUnit[]): ModelMessage[] {
  return units.flatMap((unit) => unit.messages);
}
