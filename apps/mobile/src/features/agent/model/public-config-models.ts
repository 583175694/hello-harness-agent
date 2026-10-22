import type { PublicAgentConfig, PublicModelConfig, ReasoningEffort } from '@harness/agent-protocol';

import type { ModelFixture } from '../components/composer-model-menu';

export function publicModelToFixture(model: PublicModelConfig): ModelFixture {
  const levels = model.reasoning.supported
    ? model.reasoning.levels
    : (['off'] as ReasoningEffort[]);
  return {
    id: model.id,
    label: model.label,
    reasoningLevels: levels.length ? levels : ['off'],
    defaultReasoning: model.reasoning.default,
  };
}

export function modelsFromPublicConfig(config: PublicAgentConfig): ModelFixture[] {
  return config.models.map(publicModelToFixture);
}

export function defaultReasoningForModel(
  config: PublicAgentConfig,
  modelId: string,
): ReasoningEffort {
  const model = config.models.find((item) => item.id === modelId) ?? config.models[0];
  if (!model) return 'off';
  return model.reasoning.default;
}
