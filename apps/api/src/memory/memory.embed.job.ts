import { Inject, Injectable, Logger } from '@nestjs/common';
import { describeLogError } from '../shared/logging.utils';
import { MemoryConfigService } from './memory.config';
import { MemoryEmbeddingService } from './memory.embedding.service';
import { MemoryRepository } from './memory.repository';

@Injectable()
export class MemoryEmbedJobService {
  private readonly logger = new Logger(MemoryEmbedJobService.name);

  constructor(
    @Inject(MemoryRepository) private readonly repository: MemoryRepository,
    @Inject(MemoryEmbeddingService) private readonly embedding: MemoryEmbeddingService,
    @Inject(MemoryConfigService) private readonly config: MemoryConfigService,
  ) {}

  scheduleEmbed(memoryId: string, title: string, summary: string): void {
    void this.embedRecord(memoryId, title, summary).catch((error) => {
      this.logger.warn(
        `memory embed async failed | memoryId=${memoryId} | 原因=${describeLogError(error)}`,
      );
    });
  }

  async embedRecord(memoryId: string, title: string, summary: string): Promise<'ready' | 'failed'> {
    try {
      const vector = await this.embedding.embedDocument(title, summary);
      await this.repository.saveEmbedding(memoryId, vector, this.config.embeddingModel, false);
      return 'ready';
    } catch (error) {
      this.logger.warn(
        `memory embed failed | memoryId=${memoryId} | 原因=${describeLogError(error)}`,
      );
      await this.repository.saveEmbedding(memoryId, [], this.config.embeddingModel, true);
      return 'failed';
    }
  }

  async backfillPending(userId?: string): Promise<number> {
    const pending = await this.repository.listPendingEmbed(userId);
    let count = 0;
    for (const record of pending) {
      const status = await this.embedRecord(record.memoryId, record.title, record.summary);
      if (status === 'ready') count += 1;
    }
    return count;
  }
}
