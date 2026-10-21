/**
 * 回填 AgentRunDetail.researchProjection.blocks（迁移时因体积截断被清空）。
 *
 * 优先从 SOURCE_DATABASE_URL（迁移前 pg_restore 的库）读取 Message.metadata.blocks；
 * 否则用当前 Detail 的 executions 合成 tool_activity 骨架。
 *
 * 示例：
 *   SOURCE_DATABASE_URL=postgresql://.../hello_harness_agent_repair \
 *     pnpm --filter @harness/api repair:agent-detail-blocks -- --dry-run
 *
 *   pnpm --filter @harness/api repair:agent-detail-blocks -- --session-id=<uuid>
 */
import { PrismaClient } from '@prisma/client';

import { createRunProjectionArchiver } from '../src/run-storage/run-projection.archiver';
import { extractProjectionFromMetadata } from '../src/run-storage/metadata-migration.utils';
import { synthesizeToolActivityBlocksFromExecutions } from '../src/run-storage/repair-detail-blocks.utils';
import { createRunObjectStorageFromEnv } from '../src/run-storage/create-run-object-storage';
import { RunToolOutputRepository } from '../src/run-storage/run-tool-output.repository';
import {
  assistantResearchProjectionSchema,
  type ToolExecutionSnapshot,
} from '@harness/agent-protocol';

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

function blockCount(researchProjection: unknown): number {
  if (typeof researchProjection !== 'object' || researchProjection === null) return 0;
  const blocks = (researchProjection as { blocks?: unknown }).blocks;
  return Array.isArray(blocks) ? blocks.length : 0;
}

function projectionExecutions(researchProjection: unknown): ToolExecutionSnapshot[] {
  const parsed = assistantResearchProjectionSchema.safeParse(researchProjection);
  return parsed.success ? parsed.data.executions : [];
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const target = new PrismaClient();
  const source = sourceUrl ? new PrismaClient({ datasources: { db: { url: sourceUrl } } }) : null;
  const storage = createRunObjectStorageFromEnv();
  const toolOutputs = new RunToolOutputRepository(target as never);
  const archiver = createRunProjectionArchiver({ storage, toolOutputs });

  let repaired = 0;
  let skipped = 0;
  let synthesized = 0;
  let failed = 0;
  let cursor: string | undefined;

  try {
    for (;;) {
      const batch = await target.agentRunDetail.findMany({
        where: {
          ...(options.sessionId ? { sessionId: options.sessionId } : {}),
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: options.batchSize,
        select: {
          id: true,
          runId: true,
          messageId: true,
          sessionId: true,
          researchProjection: true,
        },
      });
      if (!batch.length) break;
      cursor = batch.at(-1)?.id;

      for (const detail of batch) {
        if (blockCount(detail.researchProjection) > 0) {
          skipped += 1;
          continue;
        }
        const executions = projectionExecutions(detail.researchProjection);
        if (!executions.length) {
          skipped += 1;
          continue;
        }

        try {
          let blocks: ReturnType<typeof extractProjectionFromMetadata>['blocks'] = [];
          let plan: unknown;
          let context: unknown;
          const parsedDetail = assistantResearchProjectionSchema.parse(detail.researchProjection);
          let runExecutions = parsedDetail.executions;
          let sources = parsedDetail.sources;

          if (source) {
            const message = await source.message.findUnique({
              where: { id: detail.messageId },
              select: { metadata: true },
            });
            const metadata =
              typeof message?.metadata === 'object' &&
              message.metadata !== null &&
              !Array.isArray(message.metadata)
                ? (message.metadata as Record<string, unknown>)
                : undefined;
            const legacyBlocks = Array.isArray(metadata?.blocks) ? metadata.blocks.length : 0;
            if (metadata && legacyBlocks) {
              const projection = extractProjectionFromMetadata(metadata);
              blocks = projection.blocks;
              plan = projection.plan;
              context = projection.context;
              if (projection.sources.length) sources = projection.sources;
              if (projection.executions.length) runExecutions = projection.executions;
            }
          }

          if (!blocks.length) {
            blocks = synthesizeToolActivityBlocksFromExecutions(runExecutions);
            synthesized += 1;
          }

          const trimmed = await archiver.trimAndPersist({
            runId: detail.runId ?? detail.messageId,
            sessionId: detail.sessionId,
            projection: {
              executions: runExecutions,
              sources,
              blocks,
              ...(plan ? { plan: plan as never } : {}),
              ...(context ? { context: context as never } : {}),
            },
            dryRun: options.dryRun,
          });

          if (!trimmed.blocks.length) {
            failed += 1;
            console.error(`repair 后 blocks 仍为空 detail=${detail.id}`);
            continue;
          }

          if (!options.dryRun) {
            await target.agentRunDetail.update({
              where: { id: detail.id },
              data: {
                researchProjection: {
                  executions: trimmed.executions,
                  sources: trimmed.sources,
                  blocks: trimmed.blocks,
                  ...(trimmed.plan ? { plan: trimmed.plan } : {}),
                  ...(trimmed.context ? { context: trimmed.context } : {}),
                },
              },
            });
          }
          repaired += 1;
        } catch (error) {
          failed += 1;
          console.error(`repair 失败 detail=${detail.id}`, error);
        }
      }
    }

    console.log(
      JSON.stringify(
        {
          dryRun: options.dryRun,
          sourceDatabase: Boolean(source),
          repaired,
          skipped,
          synthesized,
          failed,
        },
        null,
        2,
      ),
    );
  } finally {
    await target.$disconnect();
    await source?.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
