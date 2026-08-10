import type { ResearchEvalCase } from './types.js';

// 在默认本地部署中提前检查真实评测必需的模型和搜索配置。
export function assertLocalResearchConfiguration(
  apiBaseUrl: string,
  cases: ResearchEvalCase[],
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isLocalApi(apiBaseUrl)) return;
  if (!env.OPENAI_API_KEY?.trim()) {
    throw new Error('主模型未就绪，请先配置 OPENAI_API_KEY。');
  }
  const needsSearch = cases.some((item) => item.expectations.search === 'required');
  if (!needsSearch) return;
  const provider = env.SEARCH_PROVIDER?.trim();
  if (provider !== 'bocha' && provider !== 'serp') {
    throw new Error('搜索 Provider 未就绪，请配置 SEARCH_PROVIDER=bocha 或 SEARCH_PROVIDER=serp。');
  }
  const providerKey = provider === 'bocha' ? env.BOCHA_SEARCH_API_KEY : env.SERPER_SEARCH_API_KEY;
  if (!providerKey?.trim()) {
    throw new Error(`搜索 Provider 未就绪，请配置 ${provider === 'bocha' ? 'BOCHA_SEARCH_API_KEY' : 'SERPER_SEARCH_API_KEY'}。`);
  }
}

// 判断 API 是否运行在本机，以免用本地环境错误校验远程部署。
function isLocalApi(apiBaseUrl: string): boolean {
  try {
    const url = new URL(apiBaseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('unsupported protocol');
    const hostname = url.hostname;
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
  } catch {
    throw new Error('--api-base-url 必须是合法的 HTTP/HTTPS URL。');
  }
}
