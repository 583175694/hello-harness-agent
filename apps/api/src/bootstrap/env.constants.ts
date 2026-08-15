// 集中维护 ConfigService 使用的环境变量键，避免跨模块字符串漂移。
export const ENV_KEYS = {
  // API 监听地址对应的环境变量。
  apiHost: 'API_HOST',
  // API 监听端口对应的环境变量。
  apiPort: 'API_PORT',
  // Web CORS 来源对应的环境变量。
  webOrigin: 'WEB_ORIGIN',
  // OpenAI-compatible 供应商密钥对应的环境变量。
  openAiApiKey: 'OPENAI_API_KEY',
  // 当前搜索 Provider 名称对应的环境变量。
  searchProvider: 'SEARCH_PROVIDER',
  // Bocha 搜索 URL 对应的环境变量。
  bochaSearchUrl: 'BOCHA_SEARCH_URL',
  // Bocha 搜索密钥对应的环境变量。
  bochaSearchApiKey: 'BOCHA_SEARCH_API_KEY',
  // Serper 搜索 URL 对应的环境变量。
  serperSearchUrl: 'SERPER_SEARCH_URL',
  // Serper 搜索密钥对应的环境变量。
  serperSearchApiKey: 'SERPER_SEARCH_API_KEY',
  evalFixtureRoot: 'EVAL_FIXTURE_ROOT',
  deepSeekTokenizerRoot: 'DEEPSEEK_TOKENIZER_ROOT',
  deepSeekContextWindowTokens: 'DEEPSEEK_CONTEXT_WINDOW_TOKENS',
  deepSeekMaxOutputTokens: 'DEEPSEEK_MAX_OUTPUT_TOKENS',
  deepSeekModelProfileSource: 'DEEPSEEK_MODEL_PROFILE_SOURCE',
  deepSeekModelProfileVerified: 'DEEPSEEK_MODEL_PROFILE_VERIFIED',
} as const;

// 集中维护本地开发和外部 Provider 的默认配置。
export const ENV_DEFAULTS = {
  // API 本地开发默认监听地址。
  apiHost: '127.0.0.1',
  // API 本地开发默认端口。
  apiPort: 4318,
  // Web 本地开发默认来源地址。
  webOrigin: 'http://127.0.0.1:4317',
  // Artifact 本地默认存储目录。
  artifactRoot: '../../artifacts',
  // Bocha 搜索 Provider 的默认 endpoint。
  bochaSearchUrl: 'https://api.bochaai.com/v1/web-search',
  // Serper 搜索 Provider 的默认 endpoint。
  serperSearchUrl: 'https://google.serper.dev/search',
} as const;
