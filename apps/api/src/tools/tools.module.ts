import { Module } from '@nestjs/common';

import { SearchModule } from '../search/search.module';
import { ToolRegistryService } from './tool-registry.service';

@Module({
  imports: [SearchModule],
  providers: [ToolRegistryService],
  exports: [ToolRegistryService],
})
export class ToolsModule {}
