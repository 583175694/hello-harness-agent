import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureHttpBodyParsing } from '../../src/bootstrap/http-body';
import { HttpExceptionFilter } from '../../src/shared/http-exception.filter';
import { PrismaService } from '../../src/database/prisma.service';
import { normalizeEmail } from '../../src/auth/auth.normalize';
import { VerificationSenderService } from '../../src/auth/verification-sender.service';

describe('auth isolation (AUTH_MODE=required)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sender: VerificationSenderService;
  const prevAuthMode = process.env.AUTH_MODE;

  beforeAll(async () => {
    process.env.AUTH_MODE = 'required';
    const { AppModule } = await import('../../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureHttpBodyParsing(app);
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    sender = app.get(VerificationSenderService);
  });

  afterAll(async () => {
    await prisma.userLoginSession.deleteMany({
      where: { user: { email: { in: ['user-a@test.local', 'user-b@test.local'] } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: ['user-a@test.local', 'user-b@test.local'] } },
    });
    await app.close();
    if (prevAuthMode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = prevAuthMode;
  });

  async function seedEmailCode(email: string, code: string) {
    const target = normalizeEmail(email);
    await prisma.verificationCode.deleteMany({ where: { channel: 'email', target } });
    await prisma.verificationCode.create({
      data: {
        channel: 'email',
        target,
        codeHash: sender.hashCode(code),
        expiresAt: new Date(Date.now() + 600_000),
        attemptCount: 0,
      },
    });
  }

  async function loginAgent(email: string, code: string) {
    await seedEmailCode(email, code);
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/email/verify').send({ email, code }).expect(201);
    return agent;
  }

  it('returns 401 for agent routes without a session cookie', async () => {
    await request(app.getHttpServer()).get('/api/agent/sessions').expect(401);
  });

  it('prevents cross-user session access', async () => {
    const agentA = await loginAgent('user-a@test.local', '111111');
    const created = await agentA.post('/api/agent/sessions').send({ title: '__test__隔离A' }).expect(201);
    const sessionId = created.body.session.id as string;

    const agentB = await loginAgent('user-b@test.local', '222222');
    await agentB.get(`/api/agent/sessions/${sessionId}`).expect(404);

    await agentA.delete(`/api/agent/sessions/${sessionId}`).expect(200);
  });
});
