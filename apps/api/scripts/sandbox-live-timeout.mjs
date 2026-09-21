import { Test } from '@nestjs/testing';
import { AppModule } from '../dist/app.module.js';
import { ExecuteCommandTool } from '../dist/tools/execute-command.tool.js';
import { SandboxManagerService } from '../dist/sandbox/sandbox-manager.service.js';
import { PrismaService } from '../dist/database/prisma.service.js';
import { getDefaultModel } from '../dist/model/model-catalog.js';

const runId = crypto.randomUUID();
let app;
let manager;
let prisma;

try {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  const tool = app.get(ExecuteCommandTool);
  manager = app.get(SandboxManagerService);
  prisma = app.get(PrismaService);

  const session = await prisma.session.create({
    data: { id: crypto.randomUUID(), userId: 'local-user', title: '__test__sandbox-timeout' },
  });
  const model = getDefaultModel();
  await prisma.agentRun.create({
    data: {
      id: runId,
      sessionId: session.id,
      inputMessageId: crypto.randomUUID(),
      assistantMessageId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      payloadHash: 'sandbox-timeout',
      status: 'running',
      provider: model.provider,
      model: model.id,
      reasoningEffort: 'high',
    },
  });

  const result = await tool.execute(
    { command: 'sleep 30', timeoutMs: 2000 },
    { sessionId: session.id, runId, toolCallId: crypto.randomUUID() },
  );
  console.log('timeout', result);
  if (result.status !== 'timeout') process.exitCode = 1;

  await prisma.session.delete({ where: { id: session.id } });
} finally {
  await manager?.releaseRun(runId).catch(() => undefined);
  await app?.close();
}
