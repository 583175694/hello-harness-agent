import { Module } from '@nestjs/common';

import { ChatModule } from '../chat/chat.module';
import { ModelModule } from '../model/model.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { SessionTitleService } from './session-title.service';

@Module({
  imports: [ChatModule, ModelModule],
  controllers: [SessionsController],
  providers: [SessionsService, SessionTitleService],
})
export class SessionsModule {}
