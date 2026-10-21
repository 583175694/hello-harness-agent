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
  bailianApiKey: 'BAILIAN_API_KEY',
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
  cosSecretId: 'COS_SECRET_ID',
  cosSecretKey: 'COS_SECRET_KEY',
  cosBucket: 'COS_BUCKET',
  cosRegion: 'COS_REGION',
  authMode: 'AUTH_MODE',
  authSessionTtlDays: 'AUTH_SESSION_TTL_DAYS',
  authCookieName: 'AUTH_COOKIE_NAME',
  authCodeTtlSeconds: 'AUTH_CODE_TTL_SECONDS',
  authSendCodeMinIntervalSec: 'AUTH_SEND_CODE_MIN_INTERVAL_SEC',
  authBootstrapAdminEmail: 'AUTH_BOOTSTRAP_ADMIN_EMAIL',
  authBootstrapAdminPhone: 'AUTH_BOOTSTRAP_ADMIN_PHONE',
  smtpHost: 'SMTP_HOST',
  smtpPort: 'SMTP_PORT',
  smtpUser: 'SMTP_USER',
  smtpPass: 'SMTP_PASS',
  smtpFrom: 'SMTP_FROM',
  aliyunSmsAuthAccessKeyId: 'ALIYUN_SMS_AUTH_ACCESS_KEY_ID',
  aliyunSmsAuthAccessKeySecret: 'ALIYUN_SMS_AUTH_ACCESS_KEY_SECRET',
  aliyunSmsAuthSignName: 'ALIYUN_SMS_AUTH_SIGN_NAME',
  aliyunSmsAuthTemplateCode: 'ALIYUN_SMS_AUTH_TEMPLATE_CODE',
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
