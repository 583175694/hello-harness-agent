import { Module } from '@nestjs/common';

import { ModelModule } from '../model/model.module';
import { ToolsModule } from '../tools/tools.module';
import { AgentRuntimeService } from './agent-runtime.service';

@Module({
  imports: [ModelModule, ToolsModule],
  providers: [AgentRuntimeService],
  exports: [AgentRuntimeService],
})
export class AgentRuntimeModule {}
