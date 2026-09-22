import { Inject, Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { SandboxInstanceRepository } from './sandbox-instance.repository';
import { SANDBOX_PROVIDER } from './sandbox.types';
import type { SandboxProvider } from './sandbox.types';
import { readSandboxRuntimeConfig, isSandboxConfigured } from './sandbox-config';

@Injectable()
export class SandboxOrphanScannerService implements OnModuleInit {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    @Optional() @Inject(SANDBOX_PROVIDER) private readonly provider: SandboxProvider | undefined,
    @Optional() private readonly instances: SandboxInstanceRepository | undefined,
    @Optional() @Inject(Logger) private readonly logger?: Logger,
  ) {}

  onModuleInit(): void {
    void this.scan();
    this.timer = setInterval(() => void this.scan(), 5 * 60_000);
    this.timer.unref?.();
  }

  async scan(): Promise<void> {
    if (!this.instances?.enabled() || !this.provider?.connect) return;
    const config = readSandboxRuntimeConfig();
    if (!isSandboxConfigured(config)) return;
    const rows = await this.instances.listActive();
    for (const row of rows) {
      try {
        await this.provider.connect!({ providerSandboxId: row.providerSandboxId });
      } catch {
        await this.instances.markStale(row.sessionId);
        await this.instances.deleteBySessionId(row.sessionId);
        this.logger?.log(
          `Sandbox orphan 回收（Provider 不可达）| session=${row.sessionId}`,
          SandboxOrphanScannerService.name,
        );
      }
    }
  }
}
