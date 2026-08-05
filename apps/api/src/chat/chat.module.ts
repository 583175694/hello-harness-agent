import { Module } from '@nestjs/common';

import { ChatService } from './chat.service';
import { SessionExecutionRegistry } from '../sessions/session-execution.registry';

@Module({
  providers: [ChatService, SessionExecutionRegistry],
  exports: [ChatService, SessionExecutionRegistry],
})
export class ChatModule {}
