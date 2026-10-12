import type { Prisma } from '@prisma/client';

import {
  assistantResearchProjectionSchema,
  type ResearchSourceSnapshot,
  type ToolExecutionSnapshot,
} from '@harness/agent-protocol';
import type { AssistantContentBlock } from '@harness/agent-protocol';

const METADATA_FAT_THRESHOLD_BYTES = 16_384;

function normalizeLegacyPassage(passage: unknown): unknown {
  if (typeof passage !== 'object' || passage === null || Array.isArray(passage)) return passage;
  const record = passage as Record<string, unknown>;
  const locator = record.locator;
  if (typeof locator !== 'object' || locator === null || Array.isArray(locator)) return passage;
  const quote = (locator as Record<string, unknown>).quote;
  if (typeof quote !== 'object' || quote === null || Array.isArray(quote)) return passage;
  const exact = (quote as Record<string, unknown>).exact;
  if (typeof exact === 'string' && typeof record.text === 'string' && record.text !== exact) {
    return { ...record, text: exact };
  }
  return passage;
}

function normalizeLegacySources(sources: unknown[]): unknown[] {
  return sources.map((source) => {
    if (typeof source !== 'object' || source === null || Array.isArray(source)) return source;
    const record = source as Record<string, unknown>;
    if (record.kind !== 'fetched' || !Array.isArray(record.passages)) return source;
    return {
      ...record,
      passages: record.passages.map(normalizeLegacyPassage),
    };
  });
}

export function metadataUtf8Bytes(metadata: Prisma.JsonValue): number {
  return Buffer.byteLength(JSON.stringify(metadata ?? {}), 'utf8');
}

export function isFatAssistantMetadata(metadata: Prisma.JsonValue): boolean {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return false;
  const record = metadata as Record<string, unknown>;
  const agent = record.agent;
  if (agent && typeof agent === 'object' && !Array.isArray(agent)) {
    const value = agent as Record<string, unknown>;
    if (Array.isArray(value.executions) && value.executions.length) return true;
    if (Array.isArray(value.sources) && value.sources.length) return true;
  }
  if (Array.isArray(record.blocks) && record.blocks.length) return true;
  return metadataUtf8Bytes(metadata) > METADATA_FAT_THRESHOLD_BYTES;
}

export function extractProjectionFromMetadata(metadata: Record<string, unknown>): {
  executions: ToolExecutionSnapshot[];
  sources: ResearchSourceSnapshot[];
  blocks: AssistantContentBlock[];
  plan?: unknown;
  context?: unknown;
} {
  const agent =
    metadata.agent && typeof metadata.agent === 'object' && !Array.isArray(metadata.agent)
      ? (metadata.agent as Record<string, unknown>)
      : {};
  const executions = Array.isArray(agent.executions) ? agent.executions : [];
  const sources = normalizeLegacySources(Array.isArray(agent.sources) ? agent.sources : []);
  const blocks = Array.isArray(metadata.blocks) ? metadata.blocks : [];
  const parsed = assistantResearchProjectionSchema.safeParse({
    executions,
    sources,
    blocks,
    ...(metadata.plan ? { plan: metadata.plan } : {}),
    ...(metadata.context ? { context: metadata.context } : {}),
  });
  if (!parsed.success) {
    return { executions: [], sources: [], blocks: [] };
  }
  return parsed.data;
}

export function compressAssistantMetadata(input: {
  metadata: Record<string, unknown>;
  runId: string;
  messageId: string;
}): Prisma.InputJsonValue {
  const agent =
    input.metadata.agent && typeof input.metadata.agent === 'object' && !Array.isArray(input.metadata.agent)
      ? (input.metadata.agent as Record<string, unknown>)
      : {};
  const toolCallCount =
    typeof agent.toolCallCount === 'number' ? agent.toolCallCount : 0;
  const detailRef =
    typeof agent.detailRef === 'string'
      ? agent.detailRef
      : typeof input.metadata.runId === 'string'
        ? input.metadata.runId
        : input.runId;
  return {
    ...(typeof input.metadata.model === 'string' ? { model: input.metadata.model } : {}),
    ...(typeof input.metadata.deliveryStatus === 'string'
      ? { deliveryStatus: input.metadata.deliveryStatus }
      : {}),
    runId: typeof input.metadata.runId === 'string' ? input.metadata.runId : input.runId,
    ...(typeof input.metadata.draftVersion === 'number'
      ? { draftVersion: input.metadata.draftVersion }
      : {}),
    ...(typeof input.metadata.lastEventSequence === 'number'
      ? { lastEventSequence: input.metadata.lastEventSequence }
      : {}),
    ...(input.metadata.error ? { error: input.metadata.error } : {}),
    agent: { toolCallCount, detailRef },
  } as Prisma.InputJsonValue;
}
