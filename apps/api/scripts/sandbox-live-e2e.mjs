import { Test } from '@nestjs/testing';
import { AppModule } from '../dist/app.module.js';
import { ExecuteCommandTool } from '../dist/tools/execute-command.tool.js';
import { SandboxManagerService } from '../dist/sandbox/sandbox-manager.service.js';
import { PrismaService } from '../dist/database/prisma.service.js';
import { getDefaultModel } from '../dist/model/model-catalog.js';

const runId = crypto.randomUUID();
let app;
let prisma;
let manager;

try {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  const tool = app.get(ExecuteCommandTool);
  manager = app.get(SandboxManagerService);
  prisma = app.get(PrismaService);

  console.log('tool.isAvailable()', tool.isAvailable());
  console.log('manager.isAvailable()', manager.isAvailable());

  const session = await prisma.session.create({
    data: {
      id: crypto.randomUUID(),
      userId: 'local-user',
      title: '__test__sandbox-live-cli',
    },
  });

  const model = getDefaultModel();
  await prisma.agentRun.create({
    data: {
      id: runId,
      sessionId: session.id,
      inputMessageId: crypto.randomUUID(),
      assistantMessageId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      payloadHash: 'sandbox-live-e2e',
      status: 'running',
      provider: model.provider,
      model: model.id,
      reasoningEffort: 'high',
    },
  });

  const context = {
    sessionId: session.id,
    runId,
    toolCallId: crypto.randomUUID(),
  };

  const echo = await tool.execute({ command: 'echo harness-e2e-ok' }, context);
  console.log('echo', echo);

  const nonzero = await tool.execute({ command: 'exit 7' }, context);
  console.log('nonzero', nonzero);

  const collect = await tool.execute(
    {
      command: 'printf collect-me > out.txt',
      output: { path: 'out.txt', fileName: 'out.txt' },
    },
    context,
  );
  console.log('collect', collect);
  if (collect.status === 'succeeded' && collect.output.collection?.status === 'failed') {
    console.log('collect.error', collect.output.collection.error);
  }

  await prisma.session.delete({ where: { id: session.id } });
} finally {
  await manager?.releaseRun(runId).catch(() => undefined);
  await app?.close();
}
