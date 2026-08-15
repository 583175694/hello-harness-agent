import type { ReasoningCapability } from '@harness/agent-protocol';

export type ConfiguredModel = {
  id: string;
  label: string;
  provider: string;
  baseUrl: string;
  reasoningFormat?: string;
  reasoning: ReasoningCapability;
  context: {
    contextWindowTokens: number;
    maxOutputTokens: number;
    tokenizer: 'deepseek-v3';
    source: string;
    verified: boolean;
  };
  request: {
    temperature?: number;
    maxTokens?: number;
  };
};

// 模型供应商配置集中在代码目录中；密钥仍由 OPENAI_API_KEY 注入，避免进入配置文件。
export const MODEL_CATALOG: readonly ConfiguredModel[] = [
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    reasoningFormat: 'deepseek.reasoning_content.v1',
    reasoning: { supported: true, levels: ['off', 'low', 'high', 'max'], default: 'high' },
    context: {
      contextWindowTokens: 131_072,
      maxOutputTokens: 8_192,
      tokenizer: 'deepseek-v3',
      source: 'P0 development default; verify against the active provider before baseline',
      verified: false,
    },
    request: { temperature: 0, maxTokens: 8_192 },
  },
  {
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    reasoningFormat: 'deepseek.reasoning_content.v1',
    reasoning: { supported: true, levels: ['off', 'low', 'high', 'max'], default: 'high' },
    context: {
      contextWindowTokens: 131_072,
      maxOutputTokens: 8_192,
      tokenizer: 'deepseek-v3',
      source: 'P0 development default; verify against the active provider before baseline',
      verified: false,
    },
    request: { temperature: 0, maxTokens: 8_192 },
  },
];

export const DEFAULT_MODEL_ID = 'deepseek-v4-flash';

export function getConfiguredModel(modelId: string): ConfiguredModel | undefined {
  return MODEL_CATALOG.find((model) => model.id.toLowerCase() === modelId.toLowerCase());
}

export function getDefaultModel(): ConfiguredModel {
  const model = getConfiguredModel(DEFAULT_MODEL_ID);
  if (!model) throw new Error(`Default model is missing from catalog: ${DEFAULT_MODEL_ID}`);
  return model;
}
