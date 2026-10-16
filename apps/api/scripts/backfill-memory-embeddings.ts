import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MemoryEmbedJobService } from '../src/memory/memory.embed.job';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    const job = app.get(MemoryEmbedJobService);
    const userId = process.argv[2];
    const count = await job.backfillPending(userId);
    console.log(`Backfilled ${count} memory embedding(s)${userId ? ` for user ${userId}` : ''}.`);
  } finally {
    await app.close();
  }
}

void main();
