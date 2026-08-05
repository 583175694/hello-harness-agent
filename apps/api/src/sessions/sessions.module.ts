import { Module } from '@nestjs/common';

import { ChatModule } from '../chat/chat.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [ChatModule],
  controllers: [SessionsController],
  providers: [SessionsService],
})
export class SessionsModule {}
