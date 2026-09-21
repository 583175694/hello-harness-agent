import { Module } from '@nestjs/common';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { FilesModule } from '../files/files.module';
import { FakeSandboxProvider } from './fake-sandbox.provider';
import { OpenSandboxProvider } from './opensandbox.provider';
import { isSandboxConfigured, readSandboxRuntimeConfig } from './sandbox-config';
import { SandboxManagerService } from './sandbox-manager.service';
import { SandboxWorkspaceService } from './sandbox-workspace.service';
import { SANDBOX_PROVIDER } from './sandbox.types';

@Module({
  imports: [FilesModule, ArtifactsModule],
  providers: [
    {
      provide: SANDBOX_PROVIDER,
      useFactory: () => {
        const config = readSandboxRuntimeConfig();
        if (isSandboxConfigured(config)) return new OpenSandboxProvider(config);
        return new FakeSandboxProvider();
      },
    },
    SandboxManagerService,
    SandboxWorkspaceService,
  ],
  exports: [SandboxManagerService, SandboxWorkspaceService],
})
export class SandboxModule {}
