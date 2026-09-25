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
  runControlCommandSchema,
  protocolVersion,
  type RunStreamEvent,
} from '@harness/agent-protocol';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { SseEventWriter } from '../stream/sse-event-writer';
import { RunCommandService } from './run-command.service';
import { RunEventHub } from './run-event-hub';
import { PendingUserInputService } from './pending-user-input.service';

@Controller('api/agent')
export class RunsController {
  constructor(
    @Inject(RunCommandService) private readonly commands: RunCommandService,
    @Inject(RunEventHub) private readonly events: RunEventHub,
    @Inject(PendingUserInputService) private readonly pending: PendingUserInputService,
  ) {}

  @Post('sessions/:sessionId/pending-inputs')
  async submitPending(
    @CurrentUser() user: RequestUser,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
  ) {
    const value = body as { content?: unknown; idempotencyKey?: unknown };
    if (
      typeof value?.content !== 'string' ||
      !value.content.trim() ||
      typeof value.idempotencyKey !== 'string'
    )
      throw new BadRequestException({
        code: 'INVALID_PENDING_INPUT',
        detail: 'content 和 idempotencyKey 必填。',
      });
    const result = await this.pending.submit(
      user.id,
      sessionId,
      value.content.trim(),
      value.idempotencyKey,
    );
    if (result.kind === 'pending') await this.broadcastPending(user.id, sessionId);
    return result;
  }

  @Get('sessions/:sessionId/pending-inputs')
  listPending(@Param('sessionId') sessionId: string) {
    return this.pending.list(sessionId);
  }

  @Post('sessions/:sessionId/pending-inputs/resume')
  resumePending(@CurrentUser() user: RequestUser, @Param('sessionId') sessionId: string) {
    return this.commands.resumeFollowUpQueue(user.id, sessionId);
  }

  @Post('pending-inputs/:inputId/send')
  sendPending(@CurrentUser() user: RequestUser, @Param('inputId') inputId: string) {
    return this.commands.sendFollowUp(user.id, inputId);
  }

  @Post('pending-inputs/:inputId/steer')
  async promotePending(@CurrentUser() user: RequestUser, @Param('inputId') inputId: string) {
    const input = await this.pending.promote(user.id, inputId);
    await this.broadcastPending(user.id, input.sessionId);
    return input;
  }

  @Post('pending-inputs/:inputId/cancel')
  async cancelPending(@CurrentUser() user: RequestUser, @Param('inputId') inputId: string) {
    const input = await this.pending.cancel(user.id, inputId);
    await this.broadcastPending(user.id, input.sessionId);
    return input;
  }

  @Post('pending-inputs/:inputId/follow-up')
  async demotePending(@CurrentUser() user: RequestUser, @Param('inputId') inputId: string) {
    const input = await this.pending.demote(user.id, inputId);
    await this.broadcastPending(user.id, input.sessionId);
    return input;
  }

  private async broadcastPending(userId: string, sessionId: string): Promise<void> {
    const runId = await this.pending.activeRunId(sessionId);
    if (!runId) return;
    const snapshot = await this.commands.snapshot(runId, userId);
    this.events.publish(runId, 'user_input.updated', {
      type: 'user_input.updated',
      pendingUserInputs: snapshot.pendingUserInputs ?? [],
    });
  }

  @Post('sessions/:sessionId/runs')
  create(
    @CurrentUser() user: RequestUser,
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
  ) {
    const result = createRunRequestSchema.safeParse(body);
    if (!result.success)
      throw new BadRequestException({
        code: 'INVALID_SESSION_REQUEST',
        detail: 'content、model 和 idempotencyKey 必须符合协议约束。',
      });
    return this.commands.create(user.id, sessionId, result.data);
  }

  @Get('runs/:runId')
  snapshot(@CurrentUser() user: RequestUser, @Param('runId') runId: string) {
    return this.commands.snapshot(runId, user.id);
  }

  @Post('runs/:runId/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: RequestUser, @Param('runId') runId: string) {
    return this.commands.cancel(runId, user.id);
  }

  @Post('runs/:runId/commands')
  @HttpCode(200)
  command(@CurrentUser() user: RequestUser, @Param('runId') runId: string, @Body() body: unknown) {
    const result = runControlCommandSchema.safeParse(body);
    if (!result.success)
      throw new BadRequestException({
        code: 'INVALID_RUN_COMMAND',
        detail: '控制命令必须是 pause、resume 或 cancel。',
      });
    return this.commands.control(runId, user.id, result.data);
  }

  @Get('runs/:runId/events')
  async subscribe(
    @CurrentUser() user: RequestUser,
    @Param('runId') runId: string,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const snapshot = await this.commands.snapshot(runId, user.id);
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
