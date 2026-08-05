import { BadRequestException, Body, Controller, Inject, Logger, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { chatRequestSchema, type ChatResponse } from '@harness/agent-protocol';

import { ChatService } from './chat.service';

@Controller('api/agent/chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(@Inject(ChatService) private readonly chat: ChatService) {}

  @Post()
  // 校验请求并返回一条完整的 assistant 消息。
  complete(@Body() body: unknown): Promise<ChatResponse> {
    const result = chatRequestSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException({
        code: 'INVALID_CHAT_REQUEST',
        detail: 'messages 必须是包含 user 或 assistant 消息的数组。',
      });
    }
    const request = result.data;
    return this.chat.complete(request.messages);
  }

  @Post('stream')
  // 输出标准聊天事件，并将供应商细节封装在服务层内。
  async stream(@Body() body: unknown, @Res() response: Response): Promise<void> {
    const result = chatRequestSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException({
        code: 'INVALID_CHAT_REQUEST',
        detail: 'messages 必须是包含 user 或 assistant 消息的数组。',
      });
    }

    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    const startedAt = Date.now();
    let firstEventAt: number | undefined;
    this.logger.log(`[chat.stream] request accepted messages=${result.data.messages.length}`);
    try {
      for await (const event of this.chat.stream(result.data.messages)) {
        if (firstEventAt === undefined) {
          firstEventAt = Date.now();
          this.logger.log(`[chat.stream] first event written after ${firstEventAt - startedAt}ms`);
        }
        response.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      this.logger.log(`[chat.stream] response completed after ${Date.now() - startedAt}ms`);
      response.end();
    } catch (error) {
      this.logger.warn(
        `[chat.stream] response failed after ${Date.now() - startedAt}ms error=${error instanceof Error ? error.name : 'UnknownError'}`,
      );
      response.write(
        `event: error\ndata: ${JSON.stringify({ type: 'stream.failed', code: 'MODEL_STREAM_FAILED', detail: error instanceof Error ? error.message : '模型流式输出失败。' })}\n\n`,
      );
      response.end();
    }
  }
}
