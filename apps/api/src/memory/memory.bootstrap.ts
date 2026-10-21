import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { MemoryConfigService } from './memory.config';

@Injectable()
export class MemoryBootstrap implements OnModuleInit {
  constructor(@Inject(MemoryConfigService) private readonly config: MemoryConfigService) {}

  onModuleInit(): void {
    this.config.assertProductionEmbeddingReady();
  }
}
