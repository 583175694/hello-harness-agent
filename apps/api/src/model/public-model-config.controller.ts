import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModelAdapter } from './model-adapter';
import { getDefaultModel, MODEL_CATALOG } from './model-catalog';
import { ENV_KEYS } from '../bootstrap/env.constants';

@Controller('api/agent/config')
export class PublicModelConfigController {
  constructor(
    @Inject(ModelAdapter) private readonly adapter: ModelAdapter,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  @Get('public')
  getPublicConfig() {
    return {
      defaultModel: getDefaultModel().id,
      models: MODEL_CATALOG.map((model) => ({
        id: model.id,
        label: model.label,
        reasoning: this.adapter.profile(model.id).reasoning,
        context: {
          contextWindowTokens:
            this.config.get<number>(ENV_KEYS.deepSeekContextWindowTokens) ??
            model.context.contextWindowTokens,
          maxOutputTokens:
            this.config.get<number>(ENV_KEYS.deepSeekMaxOutputTokens) ??
            model.context.maxOutputTokens,
          tokenizer: model.context.tokenizer,
          source:
            this.config.get<string>(ENV_KEYS.deepSeekModelProfileSource) ?? model.context.source,
          verified:
            this.config.get<boolean>(ENV_KEYS.deepSeekModelProfileVerified) ??
            model.context.verified,
        },
      })),
    };
  }
}
