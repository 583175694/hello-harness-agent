import { Module } from '@nestjs/common';

import { ChatService } from './chat.service';
import { AgentRuntimeModule } from '../agent-runtime/agent-runtime.module';
import { PersistenceModule } from '../persistence/persistence.module';
@Module({
  imports: [AgentRuntimeModule, PersistenceModule],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
