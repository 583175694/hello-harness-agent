import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { ModelModule } from '../model/model.module';
import { SessionTitleService } from '../sessions/session-title.service';
import { ActiveRunRegistry } from './active-run.registry';
import { RunCommandService } from './run-command.service';
import { RunEventHub } from './run-event-hub';
import { RunExecutor } from './run.executor';
import { RunRepository } from './run.repository';
import { RunsController } from './runs.controller';

@Module({
  imports: [ChatModule, ModelModule],
  controllers: [RunsController],
  providers: [
    ActiveRunRegistry,
    RunEventHub,
    RunRepository,
    RunExecutor,
    RunCommandService,
    SessionTitleService,
  ],
  exports: [RunCommandService, RunRepository, ActiveRunRegistry],
})
export class RunsModule {}
