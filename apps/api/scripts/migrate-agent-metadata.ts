/**
 * 一次性历史 assistant metadata 压缩与 AgentRunDetail 回填。
 *
 * 生产执行前请自行 pg_dump / COS 清单备份（见 docs/39 §6.1）。
 *
 * 示例：
 *   pnpm --filter @harness/api migrate:agent-metadata -- --dry-run --session-id=<id>
 */
import { PrismaClient } from '@prisma/client';

import { createRunProjectionArchiver } from '../src/run-storage/run-projection.archiver';
import {
  compressAssistantMetadata,
  extractProjectionFromMetadata,
  isFatAssistantMetadata,
  metadataUtf8Bytes,
} from '../src/run-storage/metadata-migration.utils';
import { createRunObjectStorageFromEnv } from '../src/run-storage/create-run-object-storage';
import { RunToolOutputRepository } from '../src/run-storage/run-tool-output.repository';

type CliOptions = {
  dryRun: boolean;
  batchSize: number;
  sessionId?: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { dryRun: false, batchSize: 20 };
  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--batch-size=')) {
      options.batchSize = Number(arg.slice('--batch-size='.length));
    } else if (arg.startsWith('--session-id=')) {
      options.sessionId = arg.slice('--session-id='.length);
    }
  }
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error('batch-size 必须是正整数');
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const storage = createRunObjectStorageFromEnv();
  const toolOutputs = new RunToolOutputRepository(prisma as never);
  const archiver = createRunProjectionArchiver({ storage, toolOutputs });

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let beforeBytes = 0;
  let afterBytes = 0;
  let cursor: string | undefined;

  try {
    for (;;) {
      const batch = await prisma.message.findMany({
        where: {
          role: 'assistant',
          ...(options.sessionId ? { sessionId: options.sessionId } : {}),
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: options.batchSize,
        select: {
          id: true,
          sessionId: true,
          runId: true,
          metadata: true,
        },
      });
      if (!batch.length) break;
      cursor = batch.at(-1)?.id;

      for (const message of batch) {
        if (!isFatAssistantMetadata(message.metadata)) {
          skipped += 1;
          continue;
        }
        const metadata =
          typeof message.metadata === 'object' && message.metadata && !Array.isArray(message.metadata)
            ? (message.metadata as Record<string, unknown>)
            : {};
        const runId =
          message.runId ??
          (typeof metadata.runId === 'string' ? metadata.runId : undefined) ??
          (typeof metadata.agent === 'object' &&
          metadata.agent &&
          !Array.isArray(metadata.agent) &&
          typeof (metadata.agent as Record<string, unknown>).detailRef === 'string'
            ? ((metadata.agent as Record<string, unknown>).detailRef as string)
            : message.id);
        const before = metadataUtf8Bytes(message.metadata);
        beforeBytes += before;

        try {
          const projection = extractProjectionFromMetadata(metadata);
          const trimmed = await archiver.trimAndPersist({
            runId,
            sessionId: message.sessionId,
            projection,
            dryRun: options.dryRun,
          });
          const compressed = compressAssistantMetadata({
            metadata,
            runId,
            messageId: message.id,
          });
          afterBytes += metadataUtf8Bytes(compressed);

          if (!options.dryRun) {
            await prisma.$transaction(async (tx) => {
              await tx.agentRunDetail.upsert({
                where: message.runId ? { runId: message.runId } : { messageId: message.id },
                create: {
                  id: crypto.randomUUID(),
                  runId: message.runId ?? undefined,
                  messageId: message.id,
                  sessionId: message.sessionId,
                  schemaVersion: 1,
                  researchProjection: {
                    executions: trimmed.executions,
                    sources: trimmed.sources,
                    blocks: trimmed.blocks,
                    ...(trimmed.plan ? { plan: trimmed.plan } : {}),
                    ...(trimmed.context ? { context: trimmed.context } : {}),
                  },
                },
                update: {
                  schemaVersion: 1,
                  researchProjection: {
                    executions: trimmed.executions,
                    sources: trimmed.sources,
                    blocks: trimmed.blocks,
                    ...(trimmed.plan ? { plan: trimmed.plan } : {}),
                    ...(trimmed.context ? { context: trimmed.context } : {}),
                  },
                },
              });
              await tx.message.update({
                where: { id: message.id },
                data: { metadata: compressed },
              });
            });
          }
          processed += 1;
        } catch (error) {
          failed += 1;
          console.error(`迁移失败 message=${message.id}`, error);
        }
      }
    }

    console.log(
      JSON.stringify(
        {
          dryRun: options.dryRun,
          processed,
          skipped,
          failed,
          beforeBytes,
          afterBytes,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
