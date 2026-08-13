import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  createRunRequestSchema,
  protocolVersion,
  type RunStreamEvent,
} from '@harness/agent-protocol';
import { SseEventWriter } from '../stream/sse-event-writer';
import { RunCommandService } from './run-command.service';
import { RunEventHub } from './run-event-hub';

@Controller('api/agent')
export class RunsController {
  constructor(
    @Inject(RunCommandService) private readonly commands: RunCommandService,
    @Inject(RunEventHub) private readonly events: RunEventHub,
  ) {}

  // 校验创建请求，并把合法请求交给命令服务。
  // 创建接口返回 Run 标识和 SSE 地址；模型生成由后台 Executor 继续执行。
  @Post('sessions/:sessionId/runs')
  create(@Param('sessionId') sessionId: string, @Body() body: unknown) {
    const result = createRunRequestSchema.safeParse(body);
    if (!result.success)
      throw new BadRequestException({
        code: 'INVALID_SESSION_REQUEST',
        detail: 'content、model 和 idempotencyKey 必须符合协议约束。',
      });
    return this.commands.create(sessionId, result.data);
  }

  // 查询 Run 的完整当前 Snapshot。
  // 返回 Latest Live Snapshot；Active Run 不在内存时由命令层退回 PostgreSQL Checkpoint。
  @Get('runs/:runId')
  snapshot(@Param('runId') runId: string) {
    return this.commands.snapshot(runId);
  }

  // 接收取消命令，并返回 Run 的最新取消状态。
  // 取消是幂等状态命令，terminal Run 重复取消直接返回已有终态。
  @Post('runs/:runId/cancel')
  @HttpCode(200)
  cancel(@Param('runId') runId: string) {
    return this.commands.cancel(runId);
  }

  // 建立 Run 的 SSE 观察连接，并按 cursor 重放事件或发送 Snapshot。
  // SSE 恢复入口：Last-Event-ID 是客户端最后成功应用的 run-scoped sequence。
  @Get('runs/:runId/events')
  async subscribe(
    @Param('runId') runId: string,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const snapshot = await this.commands.snapshot(runId);
    const writer = new SseEventWriter(response);
    writer.open();
    const cursor = lastEventId && /^\d+$/.test(lastEventId) ? Number(lastEventId) : undefined;
    const iterable = this.events.subscribe(runId, cursor);
    if (!iterable) {
      // API 进程没有该 Active Run 时只能交付 PostgreSQL Durable Snapshot；当前不恢复 Runtime。
      const event: RunStreamEvent = {
        version: protocolVersion,
        eventId: crypto.randomUUID(),
        seq: snapshot.lastEventSequence,
        sessionId: snapshot.sessionId,
        runId,
        type: 'run.snapshot',
        occurredAt: new Date().toISOString(),
        payload: snapshot,
      };
      writer.writeEvent(event);
      writer.close();
      return;
    }
    const iterator = iterable[Symbol.asyncIterator]();
    // heartbeat 只防代理层关闭空闲 HTTP 连接，不推进业务 cursor。
    const heartbeat = setInterval(() => writer.comment('heartbeat'), 15_000);
    // 浏览器断开只释放 Subscriber，绝不调用 Run cancel。
    response.on('close', () => void iterator.return?.());
    try {
      while (!response.writableEnded) {
        const result = await iterator.next();
        if (result.done) break;
        writer.writeEvent(result.value);
        // Terminal Event 或 terminal Snapshot 已完整表达最终状态，写出后主动结束本次 SSE。
        if (
          result.value.type === 'run.completed' ||
          result.value.type === 'run.failed' ||
          result.value.type === 'run.cancelled' ||
          (result.value.type === 'run.snapshot' &&
            'status' in result.value.payload &&
            ['completed', 'failed', 'cancelled'].includes(result.value.payload.status))
        )
          break;
      }
    } finally {
      clearInterval(heartbeat);
      await iterator.return?.();
      writer.close();
    }
  }
}
