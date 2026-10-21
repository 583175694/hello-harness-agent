import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class RunToolOutputRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async upsert(input: {
    runId: string;
    toolCallId: string;
    storageKey: string;
    contentType: string;
    byteSize: number;
    sha256: string;
    preview: string | null;
    tx?: Prisma.TransactionClient;
  }): Promise<void> {
    const client = input.tx ?? this.prisma;
    await client.agentRunToolOutput.upsert({
      where: { runId_toolCallId: { runId: input.runId, toolCallId: input.toolCallId } },
      create: {
        id: crypto.randomUUID(),
        runId: input.runId,
        toolCallId: input.toolCallId,
        storageKey: input.storageKey,
        contentType: input.contentType,
        byteSize: input.byteSize,
        sha256: input.sha256,
        preview: input.preview,
      },
      update: {
        storageKey: input.storageKey,
        contentType: input.contentType,
        byteSize: input.byteSize,
        sha256: input.sha256,
        preview: input.preview,
      },
    });
  }
}
