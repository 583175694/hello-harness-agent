import { Module } from '@nestjs/common';

import { ModelModule } from '../model/model.module';
import { ToolsModule } from '../tools/tools.module';
import { ContextEngineeringModule } from '../context-engineering/context-engineering.module';
import { AgentRuntimeService } from './agent-runtime.service';

@Module({
  imports: [ModelModule, ToolsModule, ContextEngineeringModule],
  providers: [AgentRuntimeService],
  exports: [AgentRuntimeService],
})
export class AgentRuntimeModule {}
