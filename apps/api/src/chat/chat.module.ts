import { Module } from '@nestjs/common';

import { ChatService } from './chat.service';
import { SessionExecutionRegistry } from '../sessions/session-execution.registry';
import { ToolsModule } from '../tools/tools.module';

@Module({
  imports: [ToolsModule],
  providers: [ChatService, SessionExecutionRegistry],
  exports: [ChatService, SessionExecutionRegistry],
})
export class ChatModule {}
