import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { access, constants, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ServiceStatus } from '@harness/agent-protocol';

import { PrismaService } from '../database/prisma.service';
import { EvalFixtureStore } from '../eval-fixtures/eval-fixture.store';

// 暴露在健康检查中的服务版本，暂与应用版本保持同步。
const serviceVersion = '0.1.0';

@Injectable()
export class HealthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(EvalFixtureStore) private readonly fixtures: EvalFixtureStore,
  ) {}

  // 构造低成本的存活检查响应。
  live(): ServiceStatus {
    return {
      status: 'ok',
      service: 'hello-harness-api',
      version: serviceVersion,
      ...(this.fixtures.hash ? { evalFixtureHash: this.fixtures.hash } : {}),
    };
  }

  // 并行检查数据库和 Artifact 存储是否就绪。
  async ready(): Promise<ServiceStatus> {
    // 汇总所有启动必需依赖，任一失败都会使 readiness 变为 not_ready。
    const checks: Record<string, 'ok' | 'error'> = {
      database: 'error',
      artifactStore: 'error',
    };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    try {
      const artifactRoot = resolve(
        process.cwd(),
        this.config.get<string>('ARTIFACT_ROOT', '../../artifacts'),
      );
      await mkdir(artifactRoot, { recursive: true });
      await access(artifactRoot, constants.R_OK | constants.W_OK);
      checks.artifactStore = 'ok';
    } catch {
      checks.artifactStore = 'error';
    }

    return {
      status: Object.values(checks).every((value) => value === 'ok') ? 'ok' : 'not_ready',
      service: 'hello-harness-api',
      version: serviceVersion,
      checks,
      ...(this.fixtures.hash ? { evalFixtureHash: this.fixtures.hash } : {}),
    };
  }
}
