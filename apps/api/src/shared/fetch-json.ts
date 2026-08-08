export type FetchJsonOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

// 表示外部 HTTP 服务返回了非成功状态。
export class UpstreamHttpError extends Error {
  constructor(readonly status: number) {
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
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, timeoutSignal])
    : timeoutSignal;
  const response = await fetch(url, { ...init, signal });

  if (!response.ok) throw new UpstreamHttpError(response.status);
  return response.json();
}
