import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MemoryBootstrap } from './memory.bootstrap';
import { MemoryConfigService } from './memory.config';
import { MemoryController } from './memory.controller';
import { MemoryEmbedJobService } from './memory.embed.job';
import { MemoryEmbeddingService } from './memory.embedding.service';
import { MemoryRepository } from './memory.repository';
import { MemoryRetrieverService } from './memory.retriever.service';
import { MemoryService } from './memory.service';
import { MemoryVectorRepository } from './memory.vector.repository';
import { MemoryWriteTool } from './memory_write.tool';

@Module({
  imports: [DatabaseModule],
  controllers: [MemoryController],
  providers: [
    MemoryBootstrap,
    MemoryConfigService,
    MemoryRepository,
    MemoryEmbeddingService,
    MemoryVectorRepository,
    MemoryEmbedJobService,
    MemoryRetrieverService,
    MemoryService,
    MemoryWriteTool,
  ],
  exports: [
    MemoryConfigService,
    MemoryRetrieverService,
    MemoryService,
    MemoryWriteTool,
    MemoryVectorRepository,
  ],
})
export class MemoryModule {}
