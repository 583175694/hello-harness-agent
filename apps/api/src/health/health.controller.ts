import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';

import type { ServiceStatus } from '@harness/agent-protocol';

import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get('healthz')
  // 报告进程存活状态，不检查外部依赖。
  healthz(): ServiceStatus {
    return this.health.live();
  }

  @Get('readyz')
  // 报告 API 依赖是否已经可以处理请求。
  async readyz(): Promise<ServiceStatus> {
    const status = await this.health.ready();

    if (status.status !== 'ok') {
      throw new ServiceUnavailableException({
        code: 'SERVICE_NOT_READY',
        detail: 'One or more required infrastructure checks failed.',
        checks: status.checks,
      });
    }

    return status;
  }
}
