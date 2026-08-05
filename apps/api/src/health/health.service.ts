import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { access, constants, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ServiceStatus } from '@harness/agent-protocol';

import { PrismaService } from '../database/prisma.service';

const serviceVersion = '0.1.0';

@Injectable()
export class HealthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  // 构造低成本的存活检查响应。
  live(): ServiceStatus {
    return {
      status: 'ok',
      service: 'hello-harness-api',
      version: serviceVersion,
    };
  }

  // 并行检查数据库和 Artifact 存储是否就绪。
  async ready(): Promise<ServiceStatus> {
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
    };
  }
}
