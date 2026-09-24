import { type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BootstrapConfigModule } from '../../src/bootstrap/config.module';
import { configureHttpBodyParsing } from '../../src/bootstrap/http-body';
import { DatabaseModule } from '../../src/database/database.module';
import { HttpExceptionFilter } from '../../src/shared/http-exception.filter';
import { PrismaService } from '../../src/database/prisma.service';
import { McpModule } from '../../src/mcp/mcp.module';

describe('MCP Admin API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testServerName = '__test__mcp_demo';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [BootstrapConfigModule, DatabaseModule, McpModule, ConfigModule.forRoot({ isGlobal: true })],
    }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    configureHttpBodyParsing(app);
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.mcpServerConfig.deleteMany({
      where: { userId: 'local-user', serverName: testServerName },
    });
  });

  afterAll(async () => {
    await prisma.mcpServerConfig.deleteMany({
      where: { userId: 'local-user', serverName: testServerName },
    });
    await app.close();
  });

  it('lists servers without secrets', async () => {
    const response = await request(app.getHttpServer()).get('/api/agent/mcp/servers').expect(200);
    expect(response.body).toHaveProperty('servers');
    expect(response.body).toHaveProperty('catalogGeneration');
  });

  it('creates server without secrets', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/agent/mcp/servers')
      .send({
        serverName: testServerName,
        url: 'https://example.com/mcp',
        enabled: false,
      })
      .expect(201);
    expect(response.body.serverName).toBe(testServerName);
    expect(response.body.secretsConfigured).toEqual({ headerNames: [], envKeys: [] });
    expect(JSON.stringify(response.body)).not.toContain('secret-token');
    expect(response.body.toolCountExposed).toBe(0);
    expect(response.body.toolCountTotal).toBe(0);
  });

  it('updates server via PUT without resending secrets', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/agent/mcp/servers')
      .send({
        serverName: `${testServerName}_put`,
        url: 'https://example.com/mcp',
        enabled: false,
      })
      .expect(201);
    const updated = await request(app.getHttpServer())
      .put(`/api/agent/mcp/servers/${created.body.id}`)
      .send({ url: 'http://127.0.0.1:8766/mcp' })
      .expect(200);
    expect(updated.body.url).toBe('http://127.0.0.1:8766/mcp');
    await prisma.mcpServerConfig.deleteMany({
      where: { userId: 'local-user', serverName: `${testServerName}_put` },
    });
  });

  it('patches enabledTools and exposes count fields', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/agent/mcp/servers')
      .send({
        serverName: `${testServerName}_patch`,
        url: 'https://example.com/mcp',
        enabled: false,
      })
      .expect(201);
    const patched = await request(app.getHttpServer())
      .patch(`/api/agent/mcp/servers/${created.body.id}`)
      .send({ enabledTools: ['ping'] })
      .expect(200);
    expect(patched.body.enabledTools).toEqual(['ping']);
    expect(patched.body.toolCountExposed).toBeLessThanOrEqual(patched.body.toolCountTotal);
    await prisma.mcpServerConfig.deleteMany({
      where: { userId: 'local-user', serverName: `${testServerName}_patch` },
    });
  });
});
