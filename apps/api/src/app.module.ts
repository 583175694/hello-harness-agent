import { Module } from '@nestjs/common';

import { BootstrapConfigModule } from './bootstrap/config.module';
import { LoggingModule } from './bootstrap/logging.module';
import { ChatModule } from './chat/chat.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { SessionsModule } from './sessions/sessions.module';
import { ToolsModule } from './tools/tools.module';
import { RunsModule } from './runs/runs.module';
import { ModelModule } from './model/model.module';

@Module({
  imports: [
    BootstrapConfigModule,
    LoggingModule,
    DatabaseModule,
    ToolsModule,
    ChatModule,
    RunsModule,
    ModelModule,
    SessionsModule,
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
