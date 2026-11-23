import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import {
  AGENT_PROTOCOL_LIMITS,
  AGENT_TOOL_NAMES,
  assistantResearchProjectionSchema,
  type AssistantContentBlock,
  type ResearchSourceSnapshot,
  type ToolExecutionSnapshot,
  type WebFetchPassage,
} from '@harness/agent-protocol';
import type { ChatProjectionSnapshot } from '../chat/chat.service';
import type { RunContextDebug } from '@harness/agent-protocol';
import {
  RUN_SOURCE_CONTENT_KEY,
  RUN_TOOL_OUTPUT_KEY,
  RunObjectStorage,
} from './run-object.storage';
import { RunToolOutputRepository } from './run-tool-output.repository';

export type RunProjectionInput = {
  executions: ToolExecutionSnapshot[];
  sources: ResearchSourceSnapshot[];
  blocks: ChatProjectionSnapshot['blocks'];
  plan?: ChatProjectionSnapshot['plan'];
  context?: RunContextDebug;
};

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (utf8Bytes(value) <= maxBytes) return value;
  let end = value.length;
  while (end > 0 && utf8Bytes(value.slice(0, end)) > maxBytes) end -= 1;
  return value.slice(0, end);
}

// 压缩 passage 文本时同步 quote.exact 与 position，满足 webFetchPassageSchema。
function shrinkWebFetchPassage(passage: WebFetchPassage, maxBytes: number): WebFetchPassage {
  const text = truncateUtf8(passage.text, maxBytes);
  if (text === passage.text) return passage;
  const start = passage.locator.position.start;
  const end = start + Array.from(text).length;
  return {
    ...passage,
    text,
    locator: {
      ...passage.locator,
      quote: { ...passage.locator.quote, exact: text },
      position: { start, end },
    },
  };
}

function sha256Hex(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export function sourceArchiveToolCallId(sourceId: string): string {
  return `source:${sourceId}`;
}

type ToolOutputUpsertInput = {
  runId: string;
  toolCallId: string;
  storageKey: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  preview: string | null;
};

@Injectable()
export class RunProjectionArchiver {
  constructor(
    @Inject(RunObjectStorage) private readonly storage: RunObjectStorage,
    @Inject(RunToolOutputRepository) private readonly toolOutputs: RunToolOutputRepository,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  /** 流式 checkpoint：仅内存裁剪，不做对象存储（避免阻塞 SSE / 模型流）。 */
  trimForCheckpoint(projection: RunProjectionInput): RunProjectionInput {
    const warn = (message: string) => this.logger.warn(message, RunProjectionArchiver.name);
    // 条数上限是协议契约，必须先收敛，否则终态校验会整批失败。
    let current = this.foldForCountLimit(projection, warn);
    if (
      projectionSerializedBytes(current) <= AGENT_PROTOCOL_LIMITS.researchProjectionMaxBytes
    ) {
      return current;
    }
    current = enforceResearchProjectionByteLimit(current, warn);
    return this.foldForCountLimit(current, warn);
  }

  /** 终态 / 迁移：外置大 payload 并写入 tool_outputs（均在短 DB 事务外完成 I/O）。 */
  async trimAndPersist(input: {
    runId: string;
    sessionId: string;
    projection: RunProjectionInput;
    dryRun?: boolean;
  }): Promise<RunProjectionInput> {
    const pendingToolOutputs: ToolOutputUpsertInput[] = [];
    const executions = await Promise.all(
      input.projection.executions.map((execution) =>
        this.archiveExecution(input.runId, execution, input.dryRun, pendingToolOutputs),
      ),
    );
    const sources = await Promise.all(
      input.projection.sources.map((source) =>
        this.archiveSource(input.runId, source, input.dryRun, pendingToolOutputs),
      ),
    );
    let trimmed: RunProjectionInput = {
      ...input.projection,
      executions,
      sources,
    };
    const warn = (message: string) => this.logger.warn(message, RunProjectionArchiver.name);
    trimmed = enforceResearchProjectionByteLimit(trimmed, warn);
    // 字节裁剪不会改变条数，最终仍需按协议上限收敛后再校验。
    trimmed = this.foldForCountLimit(trimmed, warn);
    if (!input.dryRun) {
      assistantResearchProjectionSchema.parse({
        executions: trimmed.executions,
        sources: trimmed.sources,
        blocks: trimmed.blocks,
        ...(trimmed.plan ? { plan: trimmed.plan } : {}),
        ...(trimmed.context ? { context: trimmed.context } : {}),
      });
      await Promise.all(
        pendingToolOutputs.map((record) => this.toolOutputs.upsert(record)),
      );
    }
    return trimmed;
  }

  private foldForCountLimit(
    projection: RunProjectionInput,
    warn: (message: string) => void,
  ): RunProjectionInput {
    const folded = foldExecutionsForCountLimit(
      projection,
      AGENT_PROTOCOL_LIMITS.agentProjectionExecutionsMax,
      warn,
    );
    const keepToolCallIds = new Set(folded.executions.map((item) => item.toolCallId));
    const foldedBlocks = foldBlocksForCountLimit(
      folded.blocks,
      AGENT_PROTOCOL_LIMITS.assistantContentBlocksMax,
      keepToolCallIds,
      warn,
    );
    // 执行被折叠后，对应工具块不能继续指向不存在的明细，否则前端会展示空步骤。
    const blocks = foldedBlocks.filter(
      (block) =>
        block.type !== 'tool_activity' || keepToolCallIds.has(block.toolCallId),
    );
    return blocks.length === folded.blocks.length ? folded : { ...folded, blocks };
  }

  private async archiveExecution(
    runId: string,
    execution: ToolExecutionSnapshot,
    dryRun: boolean | undefined,
    pendingToolOutputs: ToolOutputUpsertInput[],
  ): Promise<ToolExecutionSnapshot> {
    if (execution.toolName !== AGENT_TOOL_NAMES.externalTool) return execution;
    if (execution.outputRef) return execution;
    const preview = execution.outputPreview ?? '';
    if (!preview) return execution;
    const byteSize = utf8Bytes(preview);
    const inlineMax = AGENT_PROTOCOL_LIMITS.toolOutputInlineMaxBytes;
    if (byteSize <= inlineMax) return execution;

    const storageKey = RUN_TOOL_OUTPUT_KEY(runId, execution.toolCallId);
    const content = Buffer.from(preview, 'utf8');
    const contentType = 'application/json; charset=utf-8';
    const previewMax = AGENT_PROTOCOL_LIMITS.toolOutputPreviewMaxBytes;

    if (!dryRun) {
      await this.storage.putObject({ key: storageKey, content, contentType });
      pendingToolOutputs.push({
        runId,
        toolCallId: execution.toolCallId,
        storageKey,
        contentType,
        byteSize,
        sha256: sha256Hex(content),
        preview: truncateUtf8(preview, previewMax),
      });
    }

    const truncatedPreview = truncateUtf8(preview, previewMax);
    return {
      ...execution,
      outputPreview: truncatedPreview,
      outputRef: storageKey,
      outputBytes: byteSize,
      outputCharCount: execution.outputCharCount ?? byteSize,
    };
  }

  private async archiveSource(
    runId: string,
    source: ResearchSourceSnapshot,
    dryRun: boolean | undefined,
    pendingToolOutputs: ToolOutputUpsertInput[],
  ): Promise<ResearchSourceSnapshot> {
    if (source.kind !== 'fetched') return source;
    if (source.contentRef) return source;
    const payload = JSON.stringify({
      id: source.id,
      title: source.title,
      finalUrl: source.finalUrl,
      passages: source.passages,
    });
    const byteSize = utf8Bytes(payload);
    const inlineMax = AGENT_PROTOCOL_LIMITS.toolOutputInlineMaxBytes;
    if (byteSize <= inlineMax) return source;

    const storageKey = RUN_SOURCE_CONTENT_KEY(runId, source.id);
    const content = Buffer.from(payload, 'utf8');
    const contentType = 'application/json; charset=utf-8';
    const toolCallId = sourceArchiveToolCallId(source.id);
    const previewMax = AGENT_PROTOCOL_LIMITS.toolOutputPreviewMaxBytes;

    if (!dryRun) {
      await this.storage.putObject({ key: storageKey, content, contentType });
      pendingToolOutputs.push({
        runId,
        toolCallId,
        storageKey,
        contentType,
        byteSize,
        sha256: sha256Hex(content),
        preview: truncateUtf8(source.passages[0]?.text ?? source.title, previewMax),
      });
    }

    const shortPassages = source.passages.slice(0, 2).map((passage, index) =>
      shrinkWebFetchPassage(
        passage,
        index === 0 ? Math.floor(previewMax / 2) : 512,
      ),
    );

    return {
      ...source,
      passages: shortPassages,
      contentRef: storageKey,
      contentBytes: byteSize,
    };
  }
}

function projectionSerializedBytes(projection: RunProjectionInput): number {
  return utf8Bytes(
    JSON.stringify({
      executions: projection.executions,
      sources: projection.sources,
      blocks: projection.blocks,
      ...(projection.plan ? { plan: projection.plan } : {}),
      ...(projection.context ? { context: projection.context } : {}),
    }),
  );
}

/**
 * 按条数折叠内容块，保证持久化投影不超过协议上限。
 * 交付物、最终正文、用户干预与保留执行的工具块优先；其余按时间保留最近部分。
 */
export function foldBlocksForCountLimit(
  blocks: AssistantContentBlock[],
  limit: number,
  keepToolCallIds: ReadonlySet<string>,
  warn: (message: string) => void,
): AssistantContentBlock[] {
  if (blocks.length <= limit) return blocks;
  if (limit <= 0) {
    warn(`blocks 超出 ${limit} 条，全部折叠 | 当前=${blocks.length}`);
    return [];
  }
  const pinned: AssistantContentBlock[] = [];
  const candidates: AssistantContentBlock[] = [];
  for (const block of blocks) {
    const keep =
      block.type === 'artifact' ||
      block.type === 'user_intervention' ||
      (block.type === 'text' && (block.phase === 'final' || block.phase === 'pending')) ||
      (block.type === 'tool_activity' && keepToolCallIds.has(block.toolCallId));
    if (keep) pinned.push(block);
    else candidates.push(block);
  }
  const keptPinned = pinned.length > limit ? pinned.slice(pinned.length - limit) : pinned;
  const remaining = Math.max(0, limit - keptPinned.length);
  const keptCandidates = remaining > 0 ? candidates.slice(candidates.length - remaining) : [];
  const kept = new Set<AssistantContentBlock>([...keptPinned, ...keptCandidates]);
  // 保持原始时间线顺序，避免折叠后块次序错乱。
  const result = blocks.filter((block) => kept.has(block));
  warn(
    `blocks 超出 ${limit} 条，已折叠 ${blocks.length - result.length} 条 | 当前=${blocks.length}`,
  );
  return result;
}

const DELIVERY_TOOL_NAMES = new Set<string>([
  AGENT_TOOL_NAMES.createFile,
  AGENT_TOOL_NAMES.createReport,
  AGENT_TOOL_NAMES.pptExport,
]);

/** 折叠后仍必须保留的执行：交付物、失败/取消，以及被 sources 或内容块引用的调用。 */
function isPinnedExecution(
  execution: ToolExecutionSnapshot,
  referencedToolCallIds: ReadonlySet<string>,
): boolean {
  return (
    DELIVERY_TOOL_NAMES.has(execution.toolName) ||
    execution.status !== 'completed' ||
    referencedToolCallIds.has(execution.toolCallId)
  );
}

function referencedExecutionIds(projection: RunProjectionInput): Set<string> {
  const ids = new Set<string>();
  for (const source of projection.sources) {
    for (const toolCallId of source.toolCallIds ?? []) ids.add(toolCallId);
  }
  for (const block of projection.blocks) {
    if (block.type === 'tool_activity') ids.add(block.toolCallId);
  }
  return ids;
}

/**
 * 按条数折叠执行记录，保证持久化投影不超过协议上限。
 * 折叠只影响 Workbench 展示，不进入模型上下文；同质批量保留首末条并标注省略数量。
 */
export function foldExecutionsForCountLimit(
  projection: RunProjectionInput,
  limit: number,
  warn: (message: string) => void,
): RunProjectionInput {
  const total = projection.executions.length;
  if (total <= limit) return projection;
  if (limit <= 0) {
    warn(`executions 超出 ${limit} 条，全部折叠 | 当前=${total}`);
    return { ...projection, executions: [] };
  }
  const referenced = referencedExecutionIds(projection);
  const pinned: ToolExecutionSnapshot[] = [];
  const candidates: ToolExecutionSnapshot[] = [];
  for (const execution of projection.executions) {
    if (isPinnedExecution(execution, referenced)) pinned.push(execution);
    else candidates.push(execution);
  }
  // 关键执行已超过上限时，优先保留最近的，避免整批丢弃。
  const keptPinned = pinned.length > limit ? pinned.slice(pinned.length - limit) : pinned;
  const remaining = Math.max(0, limit - keptPinned.length);
  const keptCandidates = remaining > 0 ? candidates.slice(candidates.length - remaining) : [];
  const keptIds = new Set([...keptPinned, ...keptCandidates].map((item) => item.toolCallId));
  const kept = projection.executions.filter((execution) => keptIds.has(execution.toolCallId));
  const dropped = total - kept.length;
  warn(`executions 超出 ${limit} 条，已折叠 ${dropped} 条 | 当前=${total}`);
  return { ...projection, executions: kept };
}

/** 缩小 blocks 体积但保留 tool_activity / artifact，避免聊天时间线丢失。 */
export function shrinkBlocksForByteLimit(
  blocks: AssistantContentBlock[],
  options: { maxReasoningChars: number; dropProcessText: boolean },
): AssistantContentBlock[] {
  const result: AssistantContentBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'tool_activity' || block.type === 'artifact' || block.type === 'user_intervention') {
      result.push(block);
      continue;
    }
    if (block.type === 'reasoning') {
      if (options.maxReasoningChars <= 0) continue;
      const content = truncateUtf8(block.content, options.maxReasoningChars);
      if (!content) continue;
      result.push({ ...block, content });
      continue;
    }
    if (block.type === 'text') {
      if (block.phase === 'final' || block.phase === 'pending') {
        result.push(block);
        continue;
      }
      if (options.dropProcessText) continue;
      result.push(block);
    }
  }
  return result;
}

export function enforceResearchProjectionByteLimit(
  projection: RunProjectionInput,
  warn: (message: string) => void,
): RunProjectionInput {
  const maxBytes = AGENT_PROTOCOL_LIMITS.researchProjectionMaxBytes;
  let current = projection;
  const blockShrinkSteps = [
    { maxReasoningChars: 8_000, dropProcessText: false },
    { maxReasoningChars: 2_000, dropProcessText: true },
    { maxReasoningChars: 256, dropProcessText: true },
    { maxReasoningChars: 0, dropProcessText: true },
  ];
  for (let attempt = 0; attempt < 4 + blockShrinkSteps.length; attempt += 1) {
    const size = projectionSerializedBytes(current);
    if (size <= maxBytes) return current;
    warn(`researchProjection 超过 ${maxBytes} 字节，尝试第 ${attempt + 1} 次截断 | 当前=${size}`);
    if (attempt < 4) {
      const shrinkRatio = Math.min(0.5, maxBytes / size);
      current = {
        ...current,
        sources: current.sources.map((source) => {
          if (source.kind !== 'fetched') return source;
          return {
            ...source,
            passages: source.passages.slice(0, 1).map((passage) =>
              shrinkWebFetchPassage(
                passage,
                Math.max(128, Math.floor(utf8Bytes(passage.text) * shrinkRatio)),
              ),
            ),
          };
        }),
        executions: current.executions.map((execution) => {
          if (execution.toolName !== AGENT_TOOL_NAMES.externalTool || !execution.outputPreview)
            return execution;
          const nextPreview = truncateUtf8(
            execution.outputPreview,
            Math.max(256, Math.floor(execution.outputPreview.length * shrinkRatio)),
          );
          return {
            ...execution,
            outputPreview: nextPreview,
          };
        }),
      };
      continue;
    }
    const step = blockShrinkSteps[attempt - 4];
    if (!step) break;
    current = {
      ...current,
      blocks: shrinkBlocksForByteLimit(current.blocks, step),
    };
  }
  return current;
}

export function createRunProjectionArchiver(deps: {
  storage: RunObjectStorage;
  toolOutputs: RunToolOutputRepository;
  logger?: Logger;
}): RunProjectionArchiver {
  const archiver = new RunProjectionArchiver(
    deps.storage,
    deps.toolOutputs,
    deps.logger ?? ({ warn: () => undefined, log: () => undefined } as unknown as Logger),
  );
  return archiver;
}
