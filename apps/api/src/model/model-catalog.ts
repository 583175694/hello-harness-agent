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
    compactionTriggerTokens: number;
    tokenizer: 'deepseek-v3';
    source: string;
    verified: boolean;
  };
  request: {
    temperature?: number;
    maxTokens?: number;
  };
};

// Context Profile 是代码评审和正式 Baseline 的受控事实，不允许通过运行时环境变量覆盖。
// 在填写供应商权威来源并完成确认前，verified 必须保持 false。
export const DEEPSEEK_CONTEXT_WINDOW_TOKENS = 131_072;
export const DEEPSEEK_MAX_OUTPUT_TOKENS = 8_192;
export const DEEPSEEK_COMPACTION_TRIGGER_TOKENS = 100_000;
export const DEEPSEEK_MODEL_PROFILE_SOURCE = 'https://api-docs.deepseek.com/quick_start/pricing/';
export const DEEPSEEK_MODEL_PROFILE_VERIFIED = true;

if (DEEPSEEK_MODEL_PROFILE_VERIFIED && !DEEPSEEK_MODEL_PROFILE_SOURCE)
  throw new Error(
    'Verified DeepSeek model context profile requires an authoritative source in model-catalog.ts',
  );

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
      contextWindowTokens: DEEPSEEK_CONTEXT_WINDOW_TOKENS,
      maxOutputTokens: DEEPSEEK_MAX_OUTPUT_TOKENS,
      compactionTriggerTokens: DEEPSEEK_COMPACTION_TRIGGER_TOKENS,
      tokenizer: 'deepseek-v3',
      source: DEEPSEEK_MODEL_PROFILE_SOURCE,
      verified: DEEPSEEK_MODEL_PROFILE_VERIFIED,
    },
    request: { temperature: 0, maxTokens: DEEPSEEK_MAX_OUTPUT_TOKENS },
  },
  {
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    reasoningFormat: 'deepseek.reasoning_content.v1',
    reasoning: { supported: true, levels: ['off', 'low', 'high', 'max'], default: 'high' },
    context: {
      contextWindowTokens: DEEPSEEK_CONTEXT_WINDOW_TOKENS,
      maxOutputTokens: DEEPSEEK_MAX_OUTPUT_TOKENS,
      compactionTriggerTokens: DEEPSEEK_COMPACTION_TRIGGER_TOKENS,
      tokenizer: 'deepseek-v3',
      source: DEEPSEEK_MODEL_PROFILE_SOURCE,
      verified: DEEPSEEK_MODEL_PROFILE_VERIFIED,
    },
    request: { temperature: 0, maxTokens: DEEPSEEK_MAX_OUTPUT_TOKENS },
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
