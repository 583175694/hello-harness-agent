import { Module } from '@nestjs/common';

import { SearchModule } from '../search/search.module';
import { WebFetchModule } from '../web-fetch/web-fetch.module';
import { AGENT_TOOL_CLASSES, AGENT_TOOLS_PROVIDER } from './tool-catalog';
import { ToolRegistryService } from './tool-registry.service';

@Module({
  imports: [SearchModule, WebFetchModule],
  providers: [...AGENT_TOOL_CLASSES, AGENT_TOOLS_PROVIDER, ToolRegistryService],
  exports: [ToolRegistryService],
})
export class ToolsModule {}
