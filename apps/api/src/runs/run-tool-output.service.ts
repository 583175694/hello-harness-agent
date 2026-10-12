import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { AGENT_ERROR_CODES, type RunToolOutputUrlResponse } from '@harness/agent-protocol';

import { PrismaService } from '../database/prisma.service';
import { RunObjectStorage } from '../run-storage/run-object.storage';
import { RunRepository } from './run.repository';

const OUTPUT_URL_TTL_SECONDS = 300;

@Injectable()
export class RunToolOutputService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RunRepository) private readonly runs: RunRepository,
    @Inject(RunObjectStorage) private readonly storage: RunObjectStorage,
  ) {}

  async createOutputUrl(
    runId: string,
    toolCallId: string,
    userId: string,
  ): Promise<RunToolOutputUrlResponse> {
    const owned = await this.runs.findOwned(runId, userId);
    if (!owned) this.notFound();
    const row = await this.prisma.agentRunToolOutput.findUnique({
      where: { runId_toolCallId: { runId, toolCallId } },
    });
    if (!row) this.notFound();
    const url = await this.storage.createReadUrl({
      key: row.storageKey,
      expiresSeconds: OUTPUT_URL_TTL_SECONDS,
    });
    return {
      url,
      expiresInSeconds: OUTPUT_URL_TTL_SECONDS,
      byteSize: row.byteSize,
      contentType: row.contentType,
    };
  }

  async readInlineContent(
    runId: string,
    toolCallId: string,
    userId: string,
  ): Promise<{ content: Buffer; contentType: string }> {
    if (!this.storage.canReadInline()) {
      throw new NotFoundException({
        code: AGENT_ERROR_CODES.runNotFound,
        detail: '当前环境不支持内联读取。',
      });
    }
    const owned = await this.runs.findOwned(runId, userId);
    if (!owned) this.notFound();
    const row = await this.prisma.agentRunToolOutput.findUnique({
      where: { runId_toolCallId: { runId, toolCallId } },
    });
    if (!row) this.notFound();
    const result = await this.storage.readObject({ key: row.storageKey });
    return {
      content: result.content,
      contentType: result.contentType ?? row.contentType,
    };
  }

  private notFound(): never {
    throw new NotFoundException({
      code: AGENT_ERROR_CODES.runNotFound,
      detail: '工具输出不存在或不属于当前用户。',
    });
  }
}
