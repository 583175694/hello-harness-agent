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
  Query,
} from '@nestjs/common';

import {
  AGENT_ERROR_CODES,
  AGENT_PROTOCOL_LIMITS,
  createSessionRequestSchema,
  generateSessionTitleRequestSchema,
  updateSessionRequestSchema,
} from '@harness/agent-protocol';

import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { SessionsService } from './sessions.service';

@Controller('api/agent/sessions')
export class SessionsController {
  constructor(@Inject(SessionsService) private readonly sessions: SessionsService) {}

  // 创建首次发送所需的持久化会话。
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const result = createSessionRequestSchema.safeParse(body);
    if (!result.success)
      this.invalid(`title 必须是 1 到 ${AGENT_PROTOCOL_LIMITS.sessionTitleMaxLength} 个字符。`);
    return this.sessions.create(user.id, result.data.title);
  }

  // 返回当前本地用户的会话列表。
  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.sessions.list(user.id);
  }

  // 返回指定会话消息；传入 limit/before 时按时间游标分页。
  @Get(':sessionId')
  detail(
    @CurrentUser() user: RequestUser,
    @Param('sessionId') sessionId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    const parsedLimit = limit === undefined ? undefined : Number(limit);
    if (parsedLimit !== undefined && (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 200))
      this.invalid('limit 必须是 1 到 200 之间的整数。');
    return this.sessions.detail(user.id, sessionId, {
      limit: parsedLimit,
      before,
    });
  }

  // 更新会话名称或置顶状态。
  @Patch(':sessionId')
  update(
    @CurrentUser() user: RequestUser,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
  ) {
    const result = updateSessionRequestSchema.safeParse(body);
    if (!result.success)
      this.invalid(
        `仅支持更新 1 到 ${AGENT_PROTOCOL_LIMITS.sessionTitleMaxLength} 个字符的 title 或布尔值 isPinned。`,
      );
    return this.sessions.update(user.id, sessionId, result.data);
  }

  // 删除空闲会话及其级联消息。
  @Delete(':sessionId')
  delete(@CurrentUser() user: RequestUser, @Param('sessionId') sessionId: string) {
    return this.sessions.delete(user.id, sessionId);
  }

  // 使用首轮问答生成简短会话标题。
  @Post(':sessionId/title/generate')
  @HttpCode(200)
  generateTitle(
    @CurrentUser() user: RequestUser,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
  ) {
    const result = generateSessionTitleRequestSchema.safeParse(body ?? {});
    if (!result.success) this.invalid('标题生成请求不接受额外字段。');
    return this.sessions.generateTitle(user.id, sessionId);
  }

  // 抛出统一的会话请求校验错误。
  private invalid(detail: string): never {
    throw new BadRequestException({ code: AGENT_ERROR_CODES.invalidSessionRequest, detail });
  }
}
