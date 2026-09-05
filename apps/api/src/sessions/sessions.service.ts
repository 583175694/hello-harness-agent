import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
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
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';

import { SessionTitleService } from './session-title.service';
import { LOCAL_USER_ID } from '../database/local-user.bootstrap';
import { PrismaService } from '../database/prisma.service';
import { describeLogError, shortLogId } from '../shared/logging.utils';
import { compareMessageOrder } from '../chat/message-order';
import { RunRepository } from '../runs/run.repository';
import { PendingUserInputService } from '../runs/pending-user-input.service';
import { FileStorage } from '../file-storage/file-storage';

@Injectable()
export class SessionsService implements OnModuleInit {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionTitleService) private readonly titles: SessionTitleService,
    @Inject(Logger) private readonly logger: Logger,
    @Inject(RunRepository) private readonly runs: RunRepository,
    @Inject(PendingUserInputService) private readonly pendingInputs: PendingUserInputService,
    @Inject(FileStorage) private readonly fileStorage: FileStorage,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.retryFileCleanupTasks();
  }

  // 创建属于固定本地用户的持久化会话。
  async create(title: string): Promise<{ session: SessionSummary }> {
    const session = await this.prisma.session.create({
      data: { id: crypto.randomUUID(), userId: LOCAL_USER_ID, title },
    });
    return { session: this.toSummary(session) };
  }

  // 按最近更新时间返回本地用户的会话列表。
  async list(): Promise<{ sessions: SessionSummary[] }> {
    const sessions = await this.prisma.session.findMany({
      where: { userId: LOCAL_USER_ID },
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
    });
    return { sessions: sessions.map((session) => this.toSummary(session)) };
  }

  // 更新会话名称或置顶状态，并返回新的会话摘要。
  async update(
    sessionId: string,
    input: UpdateSessionRequest,
  ): Promise<{ session: SessionSummary }> {
    await this.requireOwned(sessionId);
    const session = await this.prisma.session.update({
      where: { id: sessionId },
      data: input,
    });
    return { session: this.toSummary(session) };
  }

  // 返回会话及按创建顺序排列的全部普通消息。
  // 查询会话消息及附件元数据，生成可供 Web 恢复的会话详情。
  async detail(sessionId: string): Promise<SessionDetailResponse> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId: LOCAL_USER_ID },
      include: {
        messages: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: { attachments: { include: { file: true }, orderBy: { ordinal: 'asc' } } },
        },
        runs: {
          where: { status: { in: ['queued', 'running', 'cancel_requested'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!session) this.throwNotFound();
    const pendingUserInputs = await this.pendingInputs.list(sessionId);
    return {
      session: {
        ...this.toSummary(session),
        messages: [...session.messages]
          .sort(compareMessageOrder)
          .map((message) => this.toMessage(message)),
        pendingUserInputs: pendingUserInputs.map((input) => ({
          id: input.id,
          kind: input.kind,
          status: input.status,
          content: input.content,
          sequence: input.sequence,
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
  async delete(sessionId: string): Promise<{ deletedSessionId: string }> {
    await this.requireOwned(sessionId);
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
      where: { sessionId, userId: LOCAL_USER_ID },
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
    await this.prisma.session.delete({ where: { id: sessionId } });
    await this.retryFileCleanupTasks(sessionId);
    return { deletedSessionId: sessionId };
  }

  private async retryFileCleanupTasks(sessionId?: string): Promise<void> {
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
  async generateTitle(sessionId: string): Promise<GenerateSessionTitleResponse> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId: LOCAL_USER_ID },
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
  async requireOwned(sessionId: string): Promise<Session> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId: LOCAL_USER_ID },
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

  // 将数据库消息转换为共享持久化消息协议。
  private toMessage(
    message: Message & {
      attachments?: Array<{
        file: {
          id: string;
          fileName: string;
          mediaType: string;
          size: number;
          width: number;
          height: number;
          status: string;
          errorCode: string | null;
          previewKey: string | null;
        };
      }>;
    },
  ): PersistedMessage {
    const metadata =
      typeof message.metadata === 'object' && message.metadata
        ? (message.metadata as Record<string, unknown>)
        : {};
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
      metadata,
      attachments: (message.attachments ?? []).map(({ file }) => ({
        fileId: file.id,
        fileName: file.fileName,
        mediaType: file.mediaType,
        size: file.size,
        width: file.width,
        height: file.height,
        status: file.status as 'processing' | 'ready' | 'failed' | 'rejected',
        ...(file.errorCode ? { errorCode: file.errorCode } : {}),
        ...(file.status === 'ready' && file.previewKey
          ? { previewUrl: `/api/agent/files/${file.id}/preview` }
          : {}),
      })),
    };
  }

  // 抛出统一的会话不存在或无归属错误。
  private throwNotFound(): never {
    throw new NotFoundException({
      code: AGENT_ERROR_CODES.sessionNotFound,
      detail: '会话不存在。',
    });
  }
}
