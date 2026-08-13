import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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

@Injectable()
export class SessionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionTitleService) private readonly titles: SessionTitleService,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

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
  async detail(sessionId: string): Promise<SessionDetailResponse> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId: LOCAL_USER_ID },
      include: {
        messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        runs: {
          where: { status: { in: ['queued', 'running', 'cancel_requested'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!session) this.throwNotFound();
    return {
      session: {
        ...this.toSummary(session),
        messages: [...session.messages]
          .sort(compareMessageOrder)
          .map((message) => this.toMessage(message)),
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
  async delete(sessionId: string): Promise<{ deletedSessionId: string }> {
    await this.requireOwned(sessionId);
    const active = await this.prisma.agentRun.findFirst({
      where: { sessionId, status: { in: ['queued', 'running', 'cancel_requested'] } },
    });
    if (active) {
      throw new ConflictException({
        code: AGENT_ERROR_CODES.sessionBusy,
        detail: '该会话正在生成回复，请等待完成后再删除。',
      });
    }
    await this.prisma.session.delete({ where: { id: sessionId } });
    return { deletedSessionId: sessionId };
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
  private toMessage(message: Message): PersistedMessage {
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
