import { Module } from '@nestjs/common';

import { BootstrapConfigModule } from './bootstrap/config.module';
import { LoggingModule } from './bootstrap/logging.module';
import { ChatModule } from './chat/chat.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [BootstrapConfigModule, LoggingModule, DatabaseModule, ChatModule, SessionsModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
