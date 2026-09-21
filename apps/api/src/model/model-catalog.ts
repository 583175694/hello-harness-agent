import type { ReasoningCapability } from '@harness/agent-protocol';

export type ConfiguredModel = {
  id: string;
  label: string;
  provider: string;
  baseUrl: string;
  /** Provider wire protocol. Defaults to Chat Completions for backwards compatibility. */
  api?: 'chat_completions' | 'responses';
  traceResponsesEvents?: boolean;
  reasoningFormat?: string;
  supportsVision?: boolean;
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
    finalAnswerMaxTokens?: number;
  };
};

// Context Profile 是代码评审和正式 Baseline 的受控事实，不允许通过运行时环境变量覆盖。
// 在填写供应商权威来源并完成确认前，verified 必须保持 false。
// DeepSeek 官方模型表（DeepSeek-V4.1-Flash / V4-Pro-0813）标注：
// Context Length 1M，Max Output 384K。
export const DEEPSEEK_CONTEXT_WINDOW_TOKENS = 1_000_000;
export const DEEPSEEK_MAX_OUTPUT_TOKENS = 384_000;
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
    id: 'deepseek-flash',
    label: 'DeepSeek-Flash',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    api: 'responses',
    traceResponsesEvents: true,
    supportsVision: true,
    reasoningFormat: 'deepseek.reasoning_content.v1',
    reasoning: { supported: true, levels: ['off', 'low', 'high', 'max'] as const, default: 'high' },
    context: {
      contextWindowTokens: DEEPSEEK_CONTEXT_WINDOW_TOKENS,
      maxOutputTokens: DEEPSEEK_MAX_OUTPUT_TOKENS,
      compactionTriggerTokens: DEEPSEEK_COMPACTION_TRIGGER_TOKENS,
      tokenizer: 'deepseek-v3' as const,
      source: DEEPSEEK_MODEL_PROFILE_SOURCE,
      verified: DEEPSEEK_MODEL_PROFILE_VERIFIED,
    },
    request: { temperature: 0, maxTokens: 8_192, finalAnswerMaxTokens: 16_384 },
  },
  {
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    api: 'chat_completions',
    reasoningFormat: 'deepseek.reasoning_content.v1',
    reasoning: { supported: true, levels: ['off', 'low', 'high', 'max'] as const, default: 'high' },
    context: {
      contextWindowTokens: DEEPSEEK_CONTEXT_WINDOW_TOKENS,
      maxOutputTokens: DEEPSEEK_MAX_OUTPUT_TOKENS,
      compactionTriggerTokens: DEEPSEEK_COMPACTION_TRIGGER_TOKENS,
      tokenizer: 'deepseek-v3' as const,
      source: DEEPSEEK_MODEL_PROFILE_SOURCE,
      verified: DEEPSEEK_MODEL_PROFILE_VERIFIED,
    },
    request: { temperature: 0, maxTokens: 8_192, finalAnswerMaxTokens: 16_384 },
  },
  ...(
    [
      ['qwen3.8-max', 'Qwen 3.8 Max'],
      ['qwen3.8-flash', 'Qwen 3.8 Flash'],
      ['qwen3.7-plus', 'Qwen 3.7 Plus'],
      ['qwen3.7-max', 'Qwen 3.7 Max'],
      ['qwen-plus', 'Qwen Plus'],
    ] as const
  ).map(([id, label]) => ({
    id,
    label,
    provider: 'bailian',
    baseUrl: 'https://llm-l7m1kv09x0indqzv.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    reasoning: {
      supported: true,
      levels: ['off', 'low', 'high', 'max'] as ('off' | 'low' | 'high' | 'max')[],
      default: 'high' as const,
    },
    context: {
      contextWindowTokens: DEEPSEEK_CONTEXT_WINDOW_TOKENS,
      maxOutputTokens: DEEPSEEK_MAX_OUTPUT_TOKENS,
      compactionTriggerTokens: DEEPSEEK_COMPACTION_TRIGGER_TOKENS,
      tokenizer: 'deepseek-v3' as const,
      source: 'https://help.aliyun.com/zh/model-studio/',
      verified: false,
    },
    request: { temperature: 0, maxTokens: 8_192, finalAnswerMaxTokens: 16_384 },
  })),
];

// 默认使用支持图片输入并通过 Responses API 调用的 DeepSeek V4.1 Flash。
export const DEFAULT_MODEL_ID = 'deepseek-flash';

// 按不区分大小写的 ID 查找受控模型目录配置。
export function getConfiguredModel(modelId: string): ConfiguredModel | undefined {
  return MODEL_CATALOG.find((model) => model.id.toLowerCase() === modelId.toLowerCase());
}

// 返回当前产品默认模型，并在目录配置缺失时尽早失败。
export function getDefaultModel(): ConfiguredModel {
  const model = getConfiguredModel(DEFAULT_MODEL_ID);
  if (!model) throw new Error(`Default model is missing from catalog: ${DEFAULT_MODEL_ID}`);
  return model;
}
