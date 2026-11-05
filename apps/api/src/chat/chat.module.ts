import { Module } from '@nestjs/common';

import { ChatService } from './chat.service';
import { AgentRuntimeModule } from '../agent-runtime/agent-runtime.module';

@Module({
  imports: [AgentRuntimeModule],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
