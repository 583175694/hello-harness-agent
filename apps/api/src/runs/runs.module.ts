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
import { RuntimeLifecycleRegistry } from '../agent-runtime/runtime-lifecycle';
import { PendingUserInputService } from './pending-user-input.service';

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
    RuntimeLifecycleRegistry,
    PendingUserInputService,
  ],
  exports: [RunCommandService, RunRepository, ActiveRunRegistry, PendingUserInputService],
})
export class RunsModule {}
