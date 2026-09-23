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
        url: 'http://127.0.0.1:8765/mcp',
        enabled: false,
      })
      .expect(201);
    expect(response.body.serverName).toBe(testServerName);
    expect(response.body.secretsConfigured).toEqual({ headerNames: [], envKeys: [] });
    expect(JSON.stringify(response.body)).not.toContain('secret-token');
  });
});
