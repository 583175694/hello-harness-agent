import { Module } from '@nestjs/common';

import { ModelModule } from '../model/model.module';
import { SandboxModule } from '../sandbox/sandbox.module';
import { ToolsModule } from '../tools/tools.module';
import { ContextEngineeringModule } from '../context-engineering/context-engineering.module';
import { MemoryModule } from '../memory/memory.module';
import { SkillsModule } from '../skills/skills.module';
import { AgentRuntimeService } from './agent-runtime.service';

@Module({
  imports: [ModelModule, ToolsModule, ContextEngineeringModule, SandboxModule, MemoryModule, SkillsModule],
  providers: [AgentRuntimeService],
  exports: [AgentRuntimeService],
})
export class AgentRuntimeModule {}
