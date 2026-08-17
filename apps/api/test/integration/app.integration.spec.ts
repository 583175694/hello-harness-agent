import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module';
import { configureHttpBodyParsing } from '../../src/bootstrap/http-body';
import { HttpExceptionFilter } from '../../src/shared/http-exception.filter';
import { PrismaService } from '../../src/database/prisma.service';
import { getDefaultModel } from '../../src/model/model-catalog';

describe('foundation API', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureHttpBodyParsing(app);
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
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
