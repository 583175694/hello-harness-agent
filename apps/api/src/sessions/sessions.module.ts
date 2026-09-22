import { Module } from '@nestjs/common';

import { RunsModule } from '../runs/runs.module';
import { ModelModule } from '../model/model.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { SessionTitleService } from './session-title.service';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { SandboxModule } from '../sandbox/sandbox.module';

@Module({
  imports: [RunsModule, ModelModule, FileStorageModule, SandboxModule],
  controllers: [SessionsController],
  providers: [SessionsService, SessionTitleService],
})
export class SessionsModule {}
