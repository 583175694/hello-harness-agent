// Web Fetch 边界内携带稳定错误码和重试语义的安全异常。
export class WebFetchError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'WebFetchError';
  }
}

// 把未知异常收敛为不暴露上游正文和内部地址的安全错误。
export function asWebFetchError(
  error: unknown,
  fallbackCode: string,
  fallbackDetail: string,
): WebFetchError {
  return error instanceof WebFetchError
    ? error
    : new WebFetchError(fallbackCode, fallbackDetail, true);
}
