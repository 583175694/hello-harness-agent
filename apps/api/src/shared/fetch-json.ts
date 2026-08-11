export type FetchJsonOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

const UPSTREAM_ERROR_BODY_LIMIT = 2_000;

// 表示外部 HTTP 服务返回了非成功状态。
export class UpstreamHttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly responseBody: string,
    readonly requestId?: string,
  ) {
    super(`上游 HTTP 请求失败，状态码：${status}`);
    this.name = 'UpstreamHttpError';
  }
}

// 发送带超时和外部取消支持的 JSON 请求，并校验上游 HTTP 状态。
export async function fetchJson(
  url: string | URL,
  init: RequestInit = {},
  options: FetchJsonOptions = {},
): Promise<unknown> {
  // 超时信号始终存在；调用方信号用于把上层取消继续传递给 fetch。
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? 10_000);
  const externalSignal = options.signal ?? init.signal;
  const signal = externalSignal ? AbortSignal.any([externalSignal, timeoutSignal]) : timeoutSignal;
  const response = await fetch(url, { ...init, signal });

  if (!response.ok) {
    const responseBody = (await response.text()).slice(0, UPSTREAM_ERROR_BODY_LIMIT);
    const requestId =
      response.headers.get('x-request-id') ??
      response.headers.get('request-id') ??
      response.headers.get('trace-id') ??
      undefined;
    const upstreamUrl = new URL(response.url || url.toString());
    // 查询参数可能包含凭据，只保留定位供应商接口所需的 origin 和 pathname。
    throw new UpstreamHttpError(
      response.status,
      `${upstreamUrl.origin}${upstreamUrl.pathname}`,
      responseBody,
      requestId,
    );
  }
  return response.json();
}
