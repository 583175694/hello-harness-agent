import { Module } from '@nestjs/common';

import { RunsModule } from '../runs/runs.module';
import { ModelModule } from '../model/model.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { SessionTitleService } from './session-title.service';

@Module({
  imports: [RunsModule, ModelModule],
  controllers: [SessionsController],
  providers: [SessionsService, SessionTitleService],
})
export class SessionsModule {}
