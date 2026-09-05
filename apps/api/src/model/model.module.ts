import { Module } from '@nestjs/common';

import { ModelAdapter } from './model-adapter';
import { OpenAICompatibleModelAdapter } from './openai-compatible-model.adapter';
import { PublicModelConfigController } from './public-model-config.controller';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [FilesModule],
  controllers: [PublicModelConfigController],
  providers: [
    OpenAICompatibleModelAdapter,
    { provide: ModelAdapter, useExisting: OpenAICompatibleModelAdapter },
  ],
  exports: [ModelAdapter],
})
export class ModelModule {}
