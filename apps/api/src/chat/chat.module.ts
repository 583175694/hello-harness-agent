import { Module } from '@nestjs/common';

import { ChatService } from './chat.service';
import { AgentRuntimeModule } from '../agent-runtime/agent-runtime.module';
import { PersistenceModule } from '../persistence/persistence.module';
import { SessionExecutionRegistry } from '../sessions/session-execution.registry';

@Module({
  imports: [AgentRuntimeModule, PersistenceModule],
  providers: [ChatService, SessionExecutionRegistry],
  exports: [ChatService, SessionExecutionRegistry],
})
export class ChatModule {}
