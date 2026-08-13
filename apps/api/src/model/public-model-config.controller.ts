import { Controller, Get, Inject } from '@nestjs/common';
import { ModelAdapter } from './model-adapter';
import { getDefaultModel, MODEL_CATALOG } from './model-catalog';

@Controller('api/agent/config')
export class PublicModelConfigController {
  constructor(
    @Inject(ModelAdapter) private readonly adapter: ModelAdapter,
  ) {}

  @Get('public')
  getPublicConfig() {
    return {
      defaultModel: getDefaultModel().id,
      models: MODEL_CATALOG.map((model) => ({
        id: model.id,
        label: model.label,
        reasoning: this.adapter.profile(model.id).reasoning,
      })),
    };
  }
}
