import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Logger } from 'nestjs-pino';
import { SseEventWriter } from '../stream/sse-event-writer';

import {
  AGENT_ERROR_CODES,
  AGENT_PROTOCOL_LIMITS,
  createSessionRequestSchema,
  generateSessionTitleRequestSchema,
  sessionChatRequestSchema,
  updateSessionRequestSchema,
} from '@harness/agent-protocol';

import { ChatService } from '../chat/chat.service';
import { shortLogId } from '../shared/logging.utils';
import { SessionsService } from './sessions.service';

@Controller('api/agent/sessions')
export class SessionsController {
  constructor(
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(ChatService) private readonly chat: ChatService,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  // 创建首次发送所需的持久化会话。
  @Post()
  create(@Body() body: unknown) {
    const result = createSessionRequestSchema.safeParse(body);
    if (!result.success)
      this.invalid(`title 必须是 1 到 ${AGENT_PROTOCOL_LIMITS.sessionTitleMaxLength} 个字符。`);
    return this.sessions.create(result.data.title);
  }

  // 返回当前本地用户的会话列表。
  @Get()
  list() {
    return this.sessions.list();
  }

  // 返回指定会话和完整消息历史。
  @Get(':sessionId')
  detail(@Param('sessionId') sessionId: string) {
    return this.sessions.detail(sessionId);
  }

  // 更新会话名称或置顶状态。
  @Patch(':sessionId')
  update(@Param('sessionId') sessionId: string, @Body() body: unknown) {
    const result = updateSessionRequestSchema.safeParse(body);
    if (!result.success)
      this.invalid(
        `仅支持更新 1 到 ${AGENT_PROTOCOL_LIMITS.sessionTitleMaxLength} 个字符的 title 或布尔值 isPinned。`,
      );
    return this.sessions.update(sessionId, result.data);
  }

  // 删除空闲会话及其级联消息。
  @Delete(':sessionId')
  delete(@Param('sessionId') sessionId: string) {
    return this.sessions.delete(sessionId);
  }

  // 使用首轮问答生成简短会话标题。
  @Post(':sessionId/title/generate')
  @HttpCode(200)
  generateTitle(@Param('sessionId') sessionId: string, @Body() body: unknown) {
    const result = generateSessionTitleRequestSchema.safeParse(body ?? {});
    if (!result.success) this.invalid('标题生成请求不接受额外字段。');
    return this.sessions.generateTitle(sessionId);
  }

  // 建立会话级 SSE，并保证持久化和锁在响应头发出前完成。
  @Post(':sessionId/chat/stream')
  async stream(
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
    @Res() response: Response,
  ): Promise<void> {
    const result = sessionChatRequestSchema.safeParse(body);
    if (!result.success) this.invalid('content 必须是非空字符串。');
    this.logger.log(`开始新会话 | 会话=${shortLogId(sessionId)}`, SessionsController.name);
    const prepared = await this.chat.prepareSessionStream(sessionId, result.data.content);
    const writer = new SseEventWriter(response);
    const abortController = new AbortController();
    // 浏览器断开后向模型和工具传递取消信号，防止后台继续消耗资源。
    response.on('close', () => abortController.abort());
    writer.open();
    this.logger.debug(
      `SSE 已建立 | 会话=${shortLogId(sessionId)} | 消息=${shortLogId(prepared.assistantMessageId)}`,
      SessionsController.name,
    );
    const startedAt = Date.now();
    try {
      for await (const event of this.chat.streamPrepared(prepared, abortController.signal))
        writer.write(event);
      writer.close();
    } catch (error) {
      if (!abortController.signal.aborted) {
        this.chat.logStreamFailure(sessionId, Date.now() - startedAt, error);
        writer.write({
          type: 'stream.failed',
          code: AGENT_ERROR_CODES.modelStreamFailed,
          detail: '模型流式输出失败，请稍后重试。',
        });
      }
      writer.close();
    } finally {
      // 无论正常完成、异常还是客户端断开，都必须释放会话级执行锁。
      this.chat.releaseSession(sessionId);
      this.logger.debug(
        `SSE 已结束 | 会话=${shortLogId(sessionId)} | 消息=${shortLogId(prepared.assistantMessageId)}`,
        SessionsController.name,
      );
    }
  }

  // 抛出统一的会话请求校验错误。
  private invalid(detail: string): never {
    throw new BadRequestException({ code: AGENT_ERROR_CODES.invalidSessionRequest, detail });
  }
}
