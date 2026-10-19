import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import type { Message, Session } from '@prisma/client';
import { Logger } from 'nestjs-pino';

import type {
  GenerateSessionTitleResponse,
  PersistedMessage,
  SessionDetailResponse,
  SessionSummary,
  UpdateSessionRequest,
} from '@harness/agent-protocol';
import {
  AGENT_ERROR_CODES,
  assistantContentBlockSchema,
  type AssistantContentBlock,
} from '@harness/agent-protocol';

import { SessionTitleService } from './session-title.service';
import { PrismaService } from '../database/prisma.service';
import { describeLogError, shortLogId } from '../shared/logging.utils';
import { compareMessageOrder } from '../chat/message-order';
import { RunRepository } from '../runs/run.repository';
import { PendingUserInputService } from '../runs/pending-user-input.service';
import { FileStorage } from '../file-storage/file-storage';
import { RunObjectStorage } from '../run-storage/run-object.storage';
import { SandboxManagerService } from '../sandbox/sandbox-manager.service';

@Injectable()
export class SessionsService implements OnModuleInit {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionTitleService) private readonly titles: SessionTitleService,
    @Inject(Logger) private readonly logger: Logger,
    @Inject(RunRepository) private readonly runs: RunRepository,
    @Inject(PendingUserInputService) private readonly pendingInputs: PendingUserInputService,
    @Inject(FileStorage) private readonly fileStorage: FileStorage,
    @Inject(RunObjectStorage) private readonly runObjectStorage: RunObjectStorage,
    @Optional() private readonly sandboxManager?: SandboxManagerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.retryFileCleanupTasks();
  }

  // 创建属于固定本地用户的持久化会话。
  async create(userId: string, title: string): Promise<{ session: SessionSummary }> {
    const session = await this.prisma.session.create({
      data: { id: crypto.randomUUID(), userId, title },
    });
    return { session: this.toSummary(session) };
  }

  // 按最近更新时间返回本地用户的会话列表。
  async list(userId: string): Promise<{ sessions: SessionSummary[] }> {
    const sessions = await this.prisma.session.findMany({
      where: { userId },
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
    });
    return { sessions: sessions.map((session) => this.toSummary(session)) };
  }

  // 更新会话名称或置顶状态，并返回新的会话摘要。
  async update(
    userId: string,
    sessionId: string,
    input: UpdateSessionRequest,
  ): Promise<{ session: SessionSummary }> {
    await this.requireOwned(userId, sessionId);
    const session = await this.prisma.session.update({
      where: { id: sessionId },
      data: input,
    });
    return { session: this.toSummary(session) };
  }

  // 返回会话及按创建顺序排列的全部普通消息。
  // 查询会话消息及附件元数据，生成可供 Web 恢复的会话详情。
  // 任意已登录用户凭 sessionId 可读（链接分享）；写操作仍走 requireOwned。
  async detail(
    _userId: string,
    sessionId: string,
    options: { limit?: number; before?: string } = {},
  ): Promise<SessionDetailResponse> {
    const cursor = options.before
      ? await this.prisma.message.findFirst({
          where: { id: options.before, sessionId },
          select: { id: true, createdAt: true },
        })
      : undefined;
    if (options.before && !cursor) this.throwNotFound();
    const messageWhere = {
      sessionId,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    };
    const messageTake = options.limit === undefined ? undefined : options.limit + 1;
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy:
            options.limit === undefined
              ? [{ createdAt: 'asc' as const }, { id: 'asc' as const }]
              : [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
          where: messageWhere,
          ...(messageTake ? { take: messageTake } : {}),
          include: {
            attachments: { include: { file: true }, orderBy: { ordinal: 'asc' } },
          },
        },
        runs: {
          where: { status: { in: ['queued', 'running', 'cancel_requested'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        artifactSeries: {
          orderBy: { updatedAt: 'desc' },
          include: {
            artifacts: {
              where: { status: 'ready' },
              orderBy: { versionNumber: 'asc' },
              include: { file: true, series: true },
            },
          },
        },
      },
    });
    if (!session) this.throwNotFound();
    const hasMore = options.limit !== undefined && session.messages.length > options.limit;
    const messages = hasMore ? session.messages.slice(0, options.limit) : session.messages;
    const nextBefore = hasMore ? messages.at(-1)?.id : undefined;
    const pendingUserInputs = await this.pendingInputs.list(sessionId);
    const detailBlocksByMessageId = await this.loadConversationBlocksForMessages(messages);
    return {
      session: {
        ...this.toSummary(session),
        messages: [...messages]
          .sort(compareMessageOrder)
          .map((message) =>
            this.toMessage(message, {
              conversationBlocks: detailBlocksByMessageId.get(message.id),
            }),
          ),
        ...(options.limit !== undefined
          ? {
              pagination: {
                limit: options.limit,
                hasMore,
                ...(nextBefore ? { nextBefore } : {}),
              },
            }
          : {}),
        pendingUserInputs: pendingUserInputs.map((input) => ({
          id: input.id,
          kind: input.kind,
          status: input.status,
          content: input.content,
          sequence: input.sequence,
        })),
        artifactSeries: session.artifactSeries.map((series) => ({
          seriesId: series.id,
          sessionId: series.sessionId,
          logicalName: series.logicalName,
          currentArtifactId: series.currentArtifactId,
          createdAt: series.createdAt.toISOString(),
          updatedAt: series.updatedAt.toISOString(),
          versions: series.artifacts.map((artifact) => ({
            artifactId: artifact.id,
            fileId: artifact.fileId,
            fileName: artifact.file.fileName,
            mediaType: artifact.file.mediaType,
            fileKind: artifact.file.fileKind as
              | 'text'
              | 'markdown'
              | 'json'
              | 'html'
              | 'pdf'
              | 'docx'
              | 'xlsx'
              | 'image',
            size: artifact.file.size,
            status: artifact.status,
            createdAt: artifact.createdAt.toISOString(),
            seriesId: artifact.seriesId,
            logicalName: series.logicalName,
            versionNumber: artifact.versionNumber,
            runId: artifact.runId,
            operation: artifact.operation,
            isCurrent: series.currentArtifactId === artifact.id,
            ...(artifact.parentArtifactId ? { parentArtifactId: artifact.parentArtifactId } : {}),
            ...(artifact.sourceArtifactId ? { sourceArtifactId: artifact.sourceArtifactId } : {}),
            ...(artifact.changeSummary ? { changeSummary: artifact.changeSummary } : {}),
            ...(artifact.errorCode ? { errorCode: artifact.errorCode } : {}),
            ...(artifact.file.lineCount != null ? { lineCount: artifact.file.lineCount } : {}),
            ...(artifact.file.characterCount != null ? { characterCount: artifact.file.characterCount } : {}),
          })),
        })),
        activeRun: session.runs[0]
          ? {
              runId: session.runs[0].id,
              assistantMessageId: session.runs[0].assistantMessageId,
              status: session.runs[0].status as 'queued' | 'running' | 'cancel_requested',
              lastEventSequence: Number(session.runs[0].lastEventSequence),
            }
          : null,
      },
    };
  }

  // 删除空闲会话，消息由数据库外键级联清理。
  // 删除空闲会话及数据库关系，并尽力清理对应的原图和预览对象。
  async delete(userId: string, sessionId: string): Promise<{ deletedSessionId: string }> {
    await this.requireOwned(userId, sessionId);
    // 先清理已停止但数据库仍显示 active 的 Run，避免故障会话永久阻塞删除。
    await this.runs.interruptStaleForSession(sessionId);
    const active = await this.prisma.agentRun.findFirst({
      where: { sessionId, status: { in: ['queued', 'running', 'cancel_requested'] } },
    });
    if (active) {
      throw new ConflictException({
        code: AGENT_ERROR_CODES.sessionBusy,
        detail: '该会话正在生成回复，请等待完成后再删除。',
      });
    }
    const files = await this.prisma.file.findMany({
      where: { sessionId, userId },
      select: { id: true, sessionId: true },
    });
    await this.prisma.fileCleanupTask.createMany({
      data: files.map((file) => ({
        id: crypto.randomUUID(),
        sessionId: file.sessionId,
        fileId: file.id,
      })),
      skipDuplicates: true,
    });
    await this.sandboxManager?.destroySessionForSessionDelete(sessionId).catch(() => undefined);
    await this.cleanupRunObjectPrefixes(sessionId);
    await this.prisma.session.delete({ where: { id: sessionId } });
    await this.retryFileCleanupTasks(sessionId);
    return { deletedSessionId: sessionId };
  }

  private async cleanupRunObjectPrefixes(sessionId: string): Promise<void> {
    const [runs, assistantMessages] = await Promise.all([
      this.prisma.agentRun.findMany({ where: { sessionId }, select: { id: true } }),
      this.prisma.message.findMany({
        where: { sessionId, role: 'assistant' },
        select: { id: true, runId: true },
      }),
    ]);
    const prefixes = new Set<string>();
    for (const run of runs) prefixes.add(`runs/${run.id}/`);
    for (const message of assistantMessages) {
      prefixes.add(`runs/${message.runId ?? message.id}/`);
    }
    await Promise.all(
      [...prefixes].map((prefix) =>
        this.runObjectStorage.deletePrefix({ prefix }).catch((error) => {
          this.logger.warn(
            `Run 对象前缀清理失败 | 会话=${shortLogId(sessionId)} | 前缀=${prefix} | 原因=${describeLogError(error)}`,
            SessionsService.name,
          );
        }),
      ),
    );
  }

  private async retryFileCleanupTasks(sessionId?: string): Promise<void> {
    // 启动和会话删除后补偿清理遗留文件对象。
    const tasks = await this.prisma.fileCleanupTask.findMany({
      where: {
        status: { in: ['pending', 'failed'] },
        ...(sessionId ? { sessionId } : {}),
      },
      orderBy: { updatedAt: 'asc' },
      take: 100,
    });
    await Promise.all(
      tasks.map(async (task) => {
        try {
          await this.fileStorage.deleteFile({ sessionId: task.sessionId, fileId: task.fileId });
          const file = await this.prisma.file.findFirst({
            where: { id: task.fileId, sessionId: task.sessionId },
            select: { id: true, attachments: { select: { id: true }, take: 1 } },
          });
          // Session 级联删除可能已移除 File，找不到时视为已完成。
          if (file && file.attachments.length === 0)
            await this.prisma.file.delete({ where: { id: file.id } });
          await this.prisma.fileCleanupTask.update({
            where: { id: task.id },
            data: { status: 'completed', lastError: null },
          });
        } catch (error) {
          await this.prisma.fileCleanupTask.update({
            where: { id: task.id },
            data: {
              status: 'failed',
              attempts: { increment: 1 },
              lastError: describeLogError(error).slice(0, 500),
            },
          });
          this.logger.warn(
            `文件对象清理失败 | 文件=${shortLogId(task.fileId)} | 原因=${describeLogError(error)}`,
            SessionsService.name,
          );
        }
      }),
    );
  }

  // 基于首轮问答生成标题，失败时保留已有临时标题。
  async generateTitle(userId: string, sessionId: string): Promise<GenerateSessionTitleResponse> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId },
      include: {
        messages: {
          where: { role: { in: ['user', 'assistant'] } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!session) this.throwNotFound();
    const firstUser = session.messages.find((message) => message.role === 'user');
    const firstAssistant = session.messages.find((message) => message.role === 'assistant');
    if (!firstUser || !firstAssistant)
      return { session: this.toSummary(session), generated: false };

    try {
      const title = await this.titles.generate(firstUser.content, firstAssistant.content);
      const updated = await this.prisma.session.update({
        where: { id: session.id },
        data: { title },
      });
      return { session: this.toSummary(updated), generated: true };
    } catch (error) {
      this.logger.warn(
        `会话标题生成失败 | 会话=${shortLogId(sessionId)} | 上游原因=${describeLogError(error)}`,
        SessionsService.name,
      );
      return { session: this.toSummary(session), generated: false };
    }
  }

  // 校验会话属于固定本地用户。
  async requireOwned(userId: string, sessionId: string): Promise<Session> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) this.throwNotFound();
    return session;
  }

  // 将数据库会话转换为不暴露 userId 的协议摘要。
  private toSummary(session: Session): SessionSummary {
    return {
      id: session.id,
      title: session.title,
      status: 'active',
      isPinned: session.isPinned,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  private async loadConversationBlocksForMessages(
    messages: Array<Pick<Message, 'id' | 'role' | 'runId'>>,
  ): Promise<Map<string, AssistantContentBlock[]>> {
    const assistantMessages = messages.filter((message) => message.role === 'assistant');
    if (!assistantMessages.length) return new Map();
    const messageIds = assistantMessages.map((message) => message.id);
    const runIds = [
      ...new Set(
        assistantMessages
          .map((message) => message.runId)
          .filter((runId): runId is string => Boolean(runId)),
      ),
    ];
    const details = await this.prisma.agentRunDetail.findMany({
      where: {
        OR: [
          { messageId: { in: messageIds } },
          ...(runIds.length ? [{ runId: { in: runIds } }] : []),
        ],
      },
      select: { messageId: true, runId: true, researchProjection: true },
    });
    const blocksByRunId = new Map<string, AssistantContentBlock[]>();
    const blocksByMessageId = new Map<string, AssistantContentBlock[]>();
    for (const detail of details) {
      const blocks = this.parseConversationBlocks(detail.researchProjection);
      if (!blocks.length) continue;
      blocksByMessageId.set(detail.messageId, blocks);
      if (detail.runId) blocksByRunId.set(detail.runId, blocks);
    }
    const result = new Map<string, AssistantContentBlock[]>();
    for (const message of assistantMessages) {
      const fromMessage = blocksByMessageId.get(message.id);
      const fromRun = message.runId ? blocksByRunId.get(message.runId) : undefined;
      const blocks = fromMessage ?? fromRun;
      if (blocks?.length) result.set(message.id, blocks);
    }
    return result;
  }

  // 将数据库消息转换为共享持久化消息协议。
  private toMessage(
    message: Message & {
      attachments?: Array<{
        file: {
          id: string;
          fileName: string;
          mediaType: string;
          size: number;
          width: number | null;
          height: number | null;
          fileKind:
            | 'image'
            | 'text'
            | 'markdown'
            | 'csv'
            | 'json'
            | 'html'
            | 'pdf'
            | 'docx'
            | 'xlsx'
            | 'pptx';
          status: string;
          errorCode: string | null;
          previewKey: string | null;
          lineCount: number | null;
          pageCount: number | null;
          characterCount: number | null;
          origin: 'user_uploaded' | 'agent_generated' | 'tool_result';
        };
      }>;
    },
    options?: { conversationBlocks?: AssistantContentBlock[] },
  ): PersistedMessage {
    const metadata =
      typeof message.metadata === 'object' && message.metadata
        ? (message.metadata as Record<string, unknown>)
        : {};
    const projectedMetadata = this.projectMessageMetadata(metadata, message.role, message.runId);
    const conversationBlocks =
      options?.conversationBlocks ?? this.legacyConversationBlocks(metadata, message.role);
    if (conversationBlocks.length) projectedMetadata.blocks = conversationBlocks;
    const deliveryStatus =
      message.role === 'assistant' &&
      typeof metadata.deliveryStatus === 'string' &&
      ['streaming', 'completed', 'failed', 'cancelled'].includes(metadata.deliveryStatus)
        ? (metadata.deliveryStatus as 'streaming' | 'completed' | 'failed' | 'cancelled')
        : undefined;
    return {
      id: message.id,
      sessionId: message.sessionId,
      role: message.role,
      kind: message.kind,
      content: message.content,
      ...(message.runId ? { runId: message.runId } : {}),
      ...(deliveryStatus ? { deliveryStatus } : {}),
      createdAt: message.createdAt.toISOString(),
      metadata: projectedMetadata,
      attachments: (message.attachments ?? []).map(({ file }) => ({
        fileId: file.id,
        fileName: file.fileName,
        mediaType: file.mediaType,
        size: file.size,
        ...(file.width ? { width: file.width } : {}),
        ...(file.height ? { height: file.height } : {}),
        fileKind: file.fileKind,
        status: file.status as 'processing' | 'ready' | 'failed' | 'rejected',
        origin: file.origin,
        ...(file.errorCode ? { errorCode: file.errorCode } : {}),
        ...(file.lineCount != null ? { lineCount: file.lineCount } : {}),
        ...(file.pageCount != null ? { pageCount: file.pageCount } : {}),
        ...(file.characterCount != null ? { characterCount: file.characterCount } : {}),
        ...(file.status === 'ready' ? { previewUrl: `/api/agent/files/${file.id}/preview` } : {}),
      })),
    };
  }

  // 会话列表只返回恢复对话所需的轻量字段；大型工具快照通过 Run detail 按需读取。
  private projectMessageMetadata(
    metadata: Record<string, unknown>,
    role: Message['role'],
    messageRunId?: string | null,
  ): Record<string, unknown> {
    const projected: Record<string, unknown> = {};
    for (const key of [
      'deliveryStatus',
      'runId',
      'model',
      'pendingInputId',
      'error',
      'context',
      'plan',
    ]) {
      if (metadata[key] !== undefined) projected[key] = metadata[key];
    }
    if (role === 'assistant') {
      const agent = metadata.agent;
      const detailRef =
        agent &&
        typeof agent === 'object' &&
        !Array.isArray(agent) &&
        typeof (agent as Record<string, unknown>).detailRef === 'string'
          ? ((agent as Record<string, unknown>).detailRef as string)
          : typeof metadata.runId === 'string'
            ? metadata.runId
            : messageRunId ?? undefined;
      if (agent && typeof agent === 'object' && !Array.isArray(agent)) {
        const value = agent as Record<string, unknown>;
        projected.agent = {
          toolCallCount: typeof value.toolCallCount === 'number' ? value.toolCallCount : 0,
          executions: [],
          sources: [],
          ...(detailRef ? { detailRef } : {}),
        };
      } else if (detailRef) {
        projected.agent = { toolCallCount: 0, executions: [], sources: [], detailRef };
      }
    }
    return projected;
  }

  // 迁移完成前，仍可能从旧 Message.metadata 读到 blocks；只用于恢复聊天时间线，不返回 executions/sources。
  private parseConversationBlocks(value: unknown): AssistantContentBlock[] {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
    const blocks = (value as { blocks?: unknown }).blocks;
    if (!Array.isArray(blocks)) return [];
    return blocks.flatMap((block) => {
      const parsed = assistantContentBlockSchema.safeParse(block);
      return parsed.success ? [parsed.data] : [];
    });
  }

  private legacyConversationBlocks(
    metadata: Record<string, unknown>,
    role: Message['role'],
  ): AssistantContentBlock[] {
    if (role !== 'assistant' || !Array.isArray(metadata.blocks)) return [];
    return metadata.blocks.flatMap((value) => {
      const parsed = assistantContentBlockSchema.safeParse(value);
      return parsed.success ? [parsed.data] : [];
    });
  }

  // 抛出统一的会话不存在或无归属错误。
  private throwNotFound(): never {
    throw new NotFoundException({
      code: AGENT_ERROR_CODES.sessionNotFound,
      detail: '会话不存在。',
    });
  }
}
