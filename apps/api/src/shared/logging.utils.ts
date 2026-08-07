// 缩短内部标识，保留同一次请求的关联能力，同时降低终端日志噪声。
export function shortLogId(id: string): string {
  return id.slice(0, 8);
}

// 将毫秒转换为适合人工阅读的中文耗时。
export function formatLogDuration(milliseconds: number): string {
  return milliseconds < 1000 ? `${milliseconds} 毫秒` : `${(milliseconds / 1000).toFixed(2)} 秒`;
}

// 提取稳定的异常名称，避免把正文、请求配置或供应商原始响应写入日志。
export function describeLogError(error: unknown): string {
  return error instanceof Error ? error.name : '未知错误';
}
