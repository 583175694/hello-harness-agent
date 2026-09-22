import { Module } from '@nestjs/common';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { FilesModule } from '../files/files.module';
import { DatabaseModule } from '../database/database.module';
import { FakeSandboxProvider } from './fake-sandbox.provider';
import { OpenSandboxProvider } from './opensandbox.provider';
import { isSandboxConfigured, readSandboxRuntimeConfig } from './sandbox-config';
import { BashCommandPolicyService } from './bash-command-policy.service';
import { SandboxManagerService } from './sandbox-manager.service';
import { SandboxWorkspaceService } from './sandbox-workspace.service';
import { SANDBOX_PROVIDER } from './sandbox.types';
import { SandboxInstanceRepository } from './sandbox-instance.repository';
import { SandboxOrphanScannerService } from './sandbox-orphan-scanner.service';
import { SandboxJobService } from './sandbox-job.service';
import { SandboxEgressAuditService } from './sandbox-egress-audit.service';

@Module({
  imports: [FilesModule, ArtifactsModule, DatabaseModule],
  providers: [
    {
      provide: SANDBOX_PROVIDER,
      useFactory: () => {
        const config = readSandboxRuntimeConfig();
        if (isSandboxConfigured(config)) return new OpenSandboxProvider(config);
        return new FakeSandboxProvider();
      },
    },
    BashCommandPolicyService,
    SandboxInstanceRepository,
    SandboxManagerService,
    SandboxWorkspaceService,
    SandboxOrphanScannerService,
    SandboxJobService,
    SandboxEgressAuditService,
  ],
  exports: [
    BashCommandPolicyService,
    SandboxInstanceRepository,
    SandboxManagerService,
    SandboxWorkspaceService,
    SandboxJobService,
    SandboxEgressAuditService,
  ],
})
export class SandboxModule {}
