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
import { createRunRequestSchema, protocolVersion, type RunStreamEvent } from '@harness/agent-protocol';
import { SseEventWriter } from '../stream/sse-event-writer';
import { RunCommandService } from './run-command.service';
import { RunEventHub } from './run-event-hub';

@Controller('api/agent')
export class RunsController {
  constructor(
    @Inject(RunCommandService) private readonly commands: RunCommandService,
    @Inject(RunEventHub) private readonly events: RunEventHub,
  ) {}

  @Post('sessions/:sessionId/runs')
  create(@Param('sessionId') sessionId: string, @Body() body: unknown) {
    const result = createRunRequestSchema.safeParse(body);
    if (!result.success)
      throw new BadRequestException({
        code: 'INVALID_SESSION_REQUEST',
        detail: 'content 和 idempotencyKey 必须符合协议约束。',
      });
    return this.commands.create(sessionId, result.data);
  }

  @Get('runs/:runId')
  snapshot(@Param('runId') runId: string) {
    return this.commands.snapshot(runId);
  }

  @Post('runs/:runId/cancel')
  @HttpCode(200)
  cancel(@Param('runId') runId: string) {
    return this.commands.cancel(runId);
  }

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
    const heartbeat = setInterval(() => writer.comment('heartbeat'), 15_000);
    response.on('close', () => void iterator.return?.());
    try {
      while (!response.writableEnded) {
        const result = await iterator.next();
        if (result.done) break;
        writer.writeEvent(result.value);
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
