import { Module } from '@nestjs/common';

import { BootstrapConfigModule } from './bootstrap/config.module';
import { LoggingModule } from './bootstrap/logging.module';
import { ChatModule } from './chat/chat.module';
import { DatabaseModule } from './database/database.module';
import { SessionsController } from './foundation/sessions.controller';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';

@Module({
  imports: [BootstrapConfigModule, LoggingModule, DatabaseModule, ChatModule],
  controllers: [HealthController, SessionsController],
  providers: [HealthService],
})
export class AppModule {}
