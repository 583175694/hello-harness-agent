import { type INestApplication } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module';
import { configureHttpBodyParsing } from '../../src/bootstrap/http-body';
import { HttpExceptionFilter } from '../../src/shared/http-exception.filter';
import { PrismaService } from '../../src/database/prisma.service';
import { getDefaultModel } from '../../src/model/model-catalog';
import { ArtifactsService } from '../../src/artifacts/artifacts.service';
import type { CreateFileInput, CreateFileResult } from '@harness/agent-protocol';

describe('foundation API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let artifacts: ArtifactsService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureHttpBodyParsing(app);
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    artifacts = app.get(ArtifactsService);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({
      where: { userId: 'local-user', title: { startsWith: '__test__' } },
    });
    await app.close();
  });

  it('reports liveness', async () => {
    const response = await request(app.getHttpServer()).get('/healthz').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', service: 'hello-harness-api' });
  });

  it('reports database and artifact readiness', async () => {
    const response = await request(app.getHttpServer()).get('/readyz').expect(200);
    expect(response.body.checks).toEqual({ database: 'ok', artifactStore: 'ok' });
  });

  it('stores, previews, downloads, and restores all C2-C target formats', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/agent/sessions')
      .send({ title: '__test__C2-C多格式恢复' })
      .expect(201);
    const sessionId = created.body.session.id as string;
    const runId = crypto.randomUUID();
    await prisma.agentRun.create({
      data: {
        id: runId,
        sessionId,
        inputMessageId: crypto.randomUUID(),
        assistantMessageId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        payloadHash: 'c2-c-formats',
        status: 'completed',
        provider: getDefaultModel().provider,
        model: getDefaultModel().id,
        reasoningEffort: 'high',
      },
    });
    const markdown = '# 中文报告\n\n- 恢复验证\n\n| 类型 | 状态 |\n| --- | --- |\n| C2-C | 正常 |';
    const inputs: CreateFileInput[] = [
      { fileName: '中文报告.md', content: markdown },
      { fileName: '中文报告.html', content: markdown },
      { fileName: '中文报告.pdf', content: markdown },
      { fileName: '中文报告.docx', content: markdown },
      {
        fileName: '中文数据.xlsx',
        sheets: [
          {
            name: '汇总/表',
            rows: [
              ['类型', '数值', '启用'],
              ['C2-C', 42, true],
            ],
          },
          { name: '汇总表', rows: [['备注'], [null]] },
        ],
      },
    ];
    const generated: CreateFileResult[] = [];
    try {
      for (const [index, input] of inputs.entries()) {
        generated.push(
          await artifacts.create({
            sessionId,
            runId,
            toolCallId: `format-${index}`,
            ...input,
          }),
        );
      }
      await prisma.message.create({
        data: {
          id: crypto.randomUUID(),
          userId: 'local-user',
          sessionId,
          runId,
          role: 'assistant',
          kind: 'assistant_delivery',
          content: '已生成五种格式。',
          metadata: {
            model: getDefaultModel().id,
            blocks: generated.map(({ artifact }, index) => ({
              id: `artifact-block-${index}`,
              type: 'artifact',
              ...artifact,
            })),
          },
        },
      });

      for (const { artifact, file } of generated) {
        const download = await request(app.getHttpServer())
          .get(`/api/agent/artifacts/${artifact.artifactId}/download`)
          .expect(200);
        expect(download.headers['content-type']).toContain(file.mediaType.split(';')[0]);
        expect(download.headers['content-disposition']).toMatch(/attachment/u);
        expect(download.headers['content-disposition']).toMatch(/UTF-8''/u);
        expect(Number(download.headers['content-length'])).toBe(file.size);

        const preview = await request(app.getHttpServer())
          .get(`/api/agent/artifacts/${artifact.artifactId}/preview`)
          .expect(200);
        expect(preview.text).toContain(file.fileKind === 'xlsx' ? '[Sheet:' : '# 中文报告');
      }

      const restored = await request(app.getHttpServer())
        .get(`/api/agent/sessions/${sessionId}`)
        .expect(200);
      const restoredBlocks = restored.body.session.messages[0].metadata.blocks;
      expect(restoredBlocks.map((block: { fileKind: string }) => block.fileKind)).toEqual([
        'markdown',
        'html',
        'pdf',
        'docx',
        'xlsx',
      ]);
      expect(restoredBlocks.every((block: { status: string }) => block.status === 'ready')).toBe(
        true,
      );
      expect(restored.body.session.artifactSeries).toHaveLength(5);
      expect(
        restored.body.session.artifactSeries.every(
          (series: { currentArtifactId: string; versions: Array<{ artifactId: string; versionNumber: number; operation: string; isCurrent: boolean }> }) =>
            series.versions.length === 1 &&
            series.versions[0]?.versionNumber === 1 &&
            series.versions[0]?.operation === 'create' &&
            series.versions[0]?.isCurrent === true &&
            series.currentArtifactId === series.versions[0]?.artifactId,
        ),
      ).toBe(true);
    } finally {
      await request(app.getHttpServer()).delete(`/api/agent/sessions/${sessionId}`).expect(200);
    }
  }, 30_000);

  it('keeps an immutable linear chain across revise, restore, revise, replay, and session recovery', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/agent/sessions')
      .send({ title: '__test__C2-D版本链' })
      .expect(201);
    const sessionId = created.body.session.id as string;
    const createRun = async (suffix: string, metadata: Prisma.InputJsonObject = {}) => {
      const runId = crypto.randomUUID();
      await prisma.agentRun.create({
        data: {
          id: runId,
          sessionId,
          inputMessageId: crypto.randomUUID(),
          assistantMessageId: crypto.randomUUID(),
          idempotencyKey: `c2-d-${suffix}-${crypto.randomUUID()}`,
          payloadHash: `c2-d-${suffix}`,
          status: 'completed',
          provider: getDefaultModel().provider,
          model: getDefaultModel().id,
          reasoningEffort: 'high',
          metadata,
        },
      });
      return runId;
    };

    try {
      const v1RunId = await createRun('v1');
      const v1 = await artifacts.create({
        sessionId,
        runId: v1RunId,
        toolCallId: 'create-v1',
        fileName: '版本报告.md',
        content: '# v1\n\n初始内容',
      });
      expect(v1.artifact).toMatchObject({
        versionNumber: 1,
        operation: 'create',
        isCurrent: true,
      });
      const seriesId = v1.artifact.seriesId;
      if (!seriesId) throw new Error('v1 must belong to an artifact series');

      const v2RunId = await createRun('v2', {
        artifactVersionContext: {
          seriesId,
          baseArtifactId: v1.artifact.artifactId,
          expectedCurrentArtifactId: v1.artifact.artifactId,
          changeSummary: '基于 v1 补充第二节',
        },
      });
      const v2 = await artifacts.create({
        sessionId,
        runId: v2RunId,
        toolCallId: 'create-v2',
        fileName: '版本报告.md',
        content: '# v2\n\n初始内容\n\n第二节',
      });
      expect(v2.artifact).toMatchObject({
        seriesId,
        versionNumber: 2,
        parentArtifactId: v1.artifact.artifactId,
        operation: 'revise',
        changeSummary: '基于 v1 补充第二节',
        isCurrent: true,
      });

      const restoreKey = crypto.randomUUID();
      const restored = await request(app.getHttpServer())
        .post(`/api/agent/artifacts/${v1.artifact.artifactId}/restore`)
        .send({ expectedCurrentArtifactId: v2.artifact.artifactId, idempotencyKey: restoreKey })
        .expect(201);
      expect(restored.body.artifact).toMatchObject({
        seriesId,
        versionNumber: 3,
        parentArtifactId: v2.artifact.artifactId,
        sourceArtifactId: v1.artifact.artifactId,
        operation: 'restore',
        isCurrent: true,
      });
      const v3ArtifactId = restored.body.artifact.artifactId as string;
      expect(restored.body.file.fileId).not.toBe(v1.file.fileId);

      const replay = await request(app.getHttpServer())
        .post(`/api/agent/artifacts/${v1.artifact.artifactId}/restore`)
        .send({ expectedCurrentArtifactId: v2.artifact.artifactId, idempotencyKey: restoreKey })
        .expect(201);
      expect(replay.body.artifact.artifactId).toBe(v3ArtifactId);

      const v4RunId = await createRun('v4', {
        artifactVersionContext: {
          seriesId,
          baseArtifactId: v3ArtifactId,
          expectedCurrentArtifactId: v3ArtifactId,
          changeSummary: '恢复后继续修改',
        },
      });
      const v4 = await artifacts.create({
        sessionId,
        runId: v4RunId,
        toolCallId: 'create-v4',
        fileName: '版本报告.md',
        content: '# v4\n\n恢复后的新内容',
      });
      expect(v4.artifact).toMatchObject({
        versionNumber: 4,
        parentArtifactId: v3ArtifactId,
        operation: 'revise',
        isCurrent: true,
      });

      const replayedV4 = await artifacts.create({
        sessionId,
        runId: v4RunId,
        toolCallId: 'create-v4',
        fileName: '版本报告.md',
        content: '# ignored replay',
      });
      expect(replayedV4.artifact.artifactId).toBe(v4.artifact.artifactId);

      for (const expected of [
        [v1.artifact.artifactId, '# v1'],
        [v2.artifact.artifactId, '# v2'],
        [v3ArtifactId, '# v1'],
        [v4.artifact.artifactId, '# v4'],
      ] as const) {
        const preview = await request(app.getHttpServer())
          .get(`/api/agent/artifacts/${expected[0]}/preview`)
          .expect(200);
        expect(preview.text).toContain(expected[1]);
        const download = await request(app.getHttpServer())
          .get(`/api/agent/artifacts/${expected[0]}/download`)
          .expect(200);
        expect(download.text).toContain(expected[1]);
      }

      const series = await request(app.getHttpServer())
        .get(`/api/agent/artifacts/series/${seriesId}`)
        .expect(200);
      expect(series.body.currentArtifactId).toBe(v4.artifact.artifactId);
      expect(series.body.versions.map((version: { versionNumber: number }) => version.versionNumber)).toEqual([1, 2, 3, 4]);
      expect(series.body.versions.map((version: { isCurrent: boolean }) => version.isCurrent)).toEqual([false, false, false, true]);

      const detail = await request(app.getHttpServer())
        .get(`/api/agent/sessions/${sessionId}`)
        .expect(200);
      const recovered = detail.body.session.artifactSeries.find(
        (item: { seriesId: string }) => item.seriesId === seriesId,
      );
      expect(recovered).toMatchObject({ currentArtifactId: v4.artifact.artifactId });
      expect(recovered.versions).toHaveLength(4);
      expect(
        detail.body.session.messages.some(
          (message: { runId?: string; metadata?: { blocks?: Array<{ artifactId?: string }> } }) =>
            message.runId === restored.body.artifact.runId &&
            message.metadata?.blocks?.some((block) => block.artifactId === v3ArtifactId),
        ),
      ).toBe(true);

      const deleteConflict = await request(app.getHttpServer())
        .delete(`/api/agent/artifacts/${v1.artifact.artifactId}`)
        .expect(409);
      expect(deleteConflict.body.code).toBe('ARTIFACT_DELETE_CONFLICT');
      expect(await prisma.artifact.count({ where: { seriesId, status: 'ready' } })).toBe(4);
    } finally {
      await request(app.getHttpServer()).delete(`/api/agent/sessions/${sessionId}`).expect(200);
    }
  }, 30_000);

  it('rejects stale concurrent revisions without advancing or publishing the losing version', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/agent/sessions')
      .send({ title: '__test__C2-D并发冲突' })
      .expect(201);
    const sessionId = created.body.session.id as string;
    const makeRun = async (metadata: Prisma.InputJsonObject = {}) => {
      const runId = crypto.randomUUID();
      await prisma.agentRun.create({
        data: {
          id: runId,
          sessionId,
          inputMessageId: crypto.randomUUID(),
          assistantMessageId: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
          payloadHash: crypto.randomUUID(),
          status: 'completed',
          provider: getDefaultModel().provider,
          model: getDefaultModel().id,
          reasoningEffort: 'high',
          metadata,
        },
      });
      return runId;
    };

    try {
      const v1RunId = await makeRun();
      const v1 = await artifacts.create({ sessionId, runId: v1RunId, toolCallId: 'v1', fileName: '并发.md', content: '# v1' });
      const seriesId = v1.artifact.seriesId;
      if (!seriesId) throw new Error('v1 must belong to an artifact series');
      const context = {
        artifactVersionContext: {
          seriesId,
          baseArtifactId: v1.artifact.artifactId,
          expectedCurrentArtifactId: v1.artifact.artifactId,
        },
      };
      const cancelledRunId = await makeRun(context);
      const abortController = new AbortController();
      abortController.abort();
      await expect(
        artifacts.create({
          sessionId,
          runId: cancelledRunId,
          toolCallId: 'cancelled-revision',
          fileName: '并发.md',
          content: '# cancelled',
          signal: abortController.signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(await artifacts.getSeries('local-user', seriesId)).toMatchObject({
        currentArtifactId: v1.artifact.artifactId,
        versions: [{ artifactId: v1.artifact.artifactId }],
      });

      const firstRunId = await makeRun(context);
      const secondRunId = await makeRun(context);
      const results = await Promise.allSettled([
        artifacts.create({ sessionId, runId: firstRunId, toolCallId: 'race-a', fileName: '并发.md', content: '# race a' }),
        artifacts.create({ sessionId, runId: secondRunId, toolCallId: 'race-b', fileName: '并发.md', content: '# race b' }),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((result) => result.status === 'rejected');
      expect(rejected).toMatchObject({ reason: { response: { code: 'ARTIFACT_VERSION_CONFLICT' } } });

      const series = await artifacts.getSeries('local-user', seriesId);
      expect(series.versions).toHaveLength(2);
      expect(series.currentArtifactId).toBe(series.versions[1]?.artifactId);
      expect(await prisma.file.count({ where: { sessionId, origin: 'agent_generated' } })).toBe(2);
    } finally {
      await request(app.getHttpServer()).delete(`/api/agent/sessions/${sessionId}`).expect(200);
    }
  }, 30_000);

  it('creates, sorts, restores, and cascade-deletes local sessions', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/agent/sessions')
      .send({ title: '__test__第一段会话' })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/api/agent/sessions')
      .send({ title: '__test__第二段会话' })
      .expect(201);
    await prisma.session.update({
      where: { id: first.body.session.id },
      data: { updatedAt: new Date('2099-08-05T05:00:00.000Z') },
    });
    await prisma.message.create({
      data: {
        id: crypto.randomUUID(),
        userId: 'local-user',
        sessionId: first.body.session.id,
        role: 'user',
        kind: 'user_message',
        content: '# 可恢复消息',
      },
    });

    const list = await request(app.getHttpServer()).get('/api/agent/sessions').expect(200);
    expect(
      list.body.sessions
        .map((session: { id: string }) => session.id)
        .filter((id: string) => id === first.body.session.id || id === second.body.session.id),
    ).toEqual([first.body.session.id, second.body.session.id]);
    const detail = await request(app.getHttpServer())
      .get(`/api/agent/sessions/${first.body.session.id}`)
      .expect(200);
    expect(detail.body.session.messages[0]).toMatchObject({
      role: 'user',
      kind: 'user_message',
      content: '# 可恢复消息',
    });
    expect(detail.body.session.messages[0]).not.toHaveProperty('userId');

    await request(app.getHttpServer())
      .delete(`/api/agent/sessions/${first.body.session.id}`)
      .expect(200);
    expect(await prisma.message.count({ where: { sessionId: first.body.session.id } })).toBe(0);
  });

  it('does not expose sessions owned by another user', async () => {
    const otherUserId = `other-${crypto.randomUUID()}`;
    await prisma.user.create({
      data: { id: otherUserId, displayName: 'Other User' },
    });
    const otherSession = await prisma.session.create({
      data: { id: crypto.randomUUID(), userId: otherUserId, title: '其他用户会话' },
    });
    await request(app.getHttpServer()).get(`/api/agent/sessions/${otherSession.id}`).expect(404);
    await prisma.user.delete({ where: { id: otherUserId } });
  });

  it('persists session renaming and places pinned sessions first', async () => {
    const regular = await request(app.getHttpServer())
      .post('/api/agent/sessions')
      .send({ title: '__test__普通会话' })
      .expect(201);
    const pinned = await request(app.getHttpServer())
      .post('/api/agent/sessions')
      .send({ title: '__test__待置顶会话' })
      .expect(201);
    await prisma.session.update({
      where: { id: regular.body.session.id },
      data: { updatedAt: new Date('2099-08-05T05:00:00.000Z') },
    });

    const updated = await request(app.getHttpServer())
      .patch(`/api/agent/sessions/${pinned.body.session.id}`)
      .send({ title: '__test__已重命名会话', isPinned: true })
      .expect(200);
    expect(updated.body.session).toMatchObject({ title: '__test__已重命名会话', isPinned: true });

    const list = await request(app.getHttpServer()).get('/api/agent/sessions').expect(200);
    const relevant = list.body.sessions.filter(
      (session: { id: string }) =>
        session.id === regular.body.session.id || session.id === pinned.body.session.id,
    );
    expect(relevant.map((session: { id: string }) => session.id)).toEqual([
      pinned.body.session.id,
      regular.body.session.id,
    ]);
  });

  it('rejects invalid session creation before touching the database', async () => {
    const before = await prisma.session.count({ where: { userId: 'local-user' } });
    const response = await request(app.getHttpServer())
      .post('/api/agent/sessions')
      .send({ title: '' })
      .expect(400);
    expect(response.body.code).toBe('INVALID_SESSION_REQUEST');
    expect(await prisma.session.count({ where: { userId: 'local-user' } })).toBe(before);
  });

  it('rejects an invalid create-run request before calling the model', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/agent/sessions')
      .send({ title: '__test__校验聊天请求' })
      .expect(201);
    const response = await request(app.getHttpServer())
      .post(`/api/agent/sessions/${created.body.session.id}/runs`)
      .send({ content: '   ', idempotencyKey: 'invalid-run' })
      .expect(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body.code).toBe('INVALID_SESSION_REQUEST');
  });

  it('accepts long user requests larger than the default 100KB body limit', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/agent/sessions')
      .send({ title: '__test__长上下文请求' })
      .expect(201);
    const content = '上下文压力材料。'.repeat(15_000);
    expect(Buffer.byteLength(JSON.stringify({ content }), 'utf8')).toBeGreaterThan(100 * 1_024);

    const response = await request(app.getHttpServer())
      .post(`/api/agent/sessions/${created.body.session.id}/runs`)
      .send({ content, model: 'missing-model', idempotencyKey: crypto.randomUUID() })
      .expect(400);
    expect(response.body.code).toBe('INVALID_SESSION_REQUEST');
    expect(response.body.detail).toContain('model');
  });

  it('blocks concurrent runs and deletion while a session is active', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/agent/sessions')
      .send({ title: '__test__活跃会话' })
      .expect(201);
    const sessionId = created.body.session.id as string;
    const activeRunId = crypto.randomUUID();
    await prisma.agentRun.create({
      data: {
        id: activeRunId,
        sessionId,
        inputMessageId: crypto.randomUUID(),
        assistantMessageId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        payloadHash: 'test',
        status: 'running',
        provider: getDefaultModel().provider,
        model: getDefaultModel().id,
        reasoningEffort: 'high',
      },
    });
    try {
      const chat = await request(app.getHttpServer())
        .post(`/api/agent/sessions/${sessionId}/runs`)
        .send({
          content: '第二条并发消息',
          model: getDefaultModel().id,
          idempotencyKey: crypto.randomUUID(),
        })
        .expect(409);
      expect(chat.body.code).toBe('SESSION_BUSY');
      const deletion = await request(app.getHttpServer())
        .delete(`/api/agent/sessions/${sessionId}`)
        .expect(409);
      expect(deletion.body.code).toBe('SESSION_BUSY');
      expect(await prisma.message.count({ where: { sessionId } })).toBe(0);
    } finally {
      await prisma.agentRun.delete({ where: { id: activeRunId } });
    }
  });

  it('keeps the provisional title when the first answer is not available', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/agent/sessions')
      .send({ title: '__test__临时标题' })
      .expect(201);
    const response = await request(app.getHttpServer())
      .post(`/api/agent/sessions/${created.body.session.id}/title/generate`)
      .send({})
      .expect(200);
    expect(response.body).toMatchObject({
      generated: false,
      session: { title: '__test__临时标题' },
    });
  });

  it('creates an idempotent durable run and rejects a changed payload', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/agent/sessions')
      .send({ title: '__test__幂等运行' })
      .expect(201);
    const path = `/api/agent/sessions/${created.body.session.id}/runs`;
    const first = await request(app.getHttpServer())
      .post(path)
      .send({ content: '幂等问题', model: getDefaultModel().id, idempotencyKey: 'same-key' })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(path)
      .send({ content: '幂等问题', model: getDefaultModel().id, idempotencyKey: 'same-key' })
      .expect(201);
    expect(second.body.runId).toBe(first.body.runId);
    const conflict = await request(app.getHttpServer())
      .post(path)
      .send({ content: '另一条问题', model: getDefaultModel().id, idempotencyKey: 'same-key' })
      .expect(409);
    expect(conflict.body.code).toBe('IDEMPOTENCY_CONFLICT');
  });
});
