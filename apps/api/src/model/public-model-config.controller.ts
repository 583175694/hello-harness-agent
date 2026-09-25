import { Controller, Get, Inject } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { ModelAdapter } from './model-adapter';
import { getDefaultModel, MODEL_CATALOG } from './model-catalog';

@Public()
@Controller('api/agent/config')
export class PublicModelConfigController {
  constructor(@Inject(ModelAdapter) private readonly adapter: ModelAdapter) {}

  @Get('public')
  getPublicConfig() {
    return {
      defaultModel: getDefaultModel().id,
      models: MODEL_CATALOG.map((model) => ({
        id: model.id,
        label: model.label,
        reasoning: this.adapter.profile(model.id).reasoning,
        supportsVision: this.adapter.profile(model.id).supportsVision ?? false,
        context: model.context,
      })),
    };
  }
}
