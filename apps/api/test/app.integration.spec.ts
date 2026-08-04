import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/shared/http-exception.filter';

describe('foundation API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
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

  it('returns a structured unavailable response for sessions', async () => {
    const response = await request(app.getHttpServer()).post('/api/agent/sessions').expect(501);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body.code).toBe('CAPABILITY_NOT_IMPLEMENTED');
  });
});
