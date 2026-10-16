import { HttpException } from '@nestjs/common';

// 缩短内部标识，保留同一次请求的关联能力，同时降低终端日志噪声。
export function shortLogId(id: string): string {
  return id.slice(0, 8);
}

// 将毫秒转换为适合人工阅读的中文耗时。
export function formatLogDuration(milliseconds: number): string {
  return milliseconds < 1000 ? `${milliseconds} 毫秒` : `${(milliseconds / 1000).toFixed(2)} 秒`;
}

const LOG_ERROR_DETAIL_LIMIT = 3_000;

type ErrorLike = Error & {
  status?: unknown;
  code?: unknown;
  type?: unknown;
  requestID?: unknown;
  requestId?: unknown;
  responseBody?: unknown;
  url?: unknown;
  cause?: unknown;
};

// 对上游错误正文做兜底脱敏，防止供应商回显请求头或密钥。
function sanitizeLogDetail(value: unknown): string {
  let text: string;
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  return (text || String(value))
    .replace(
      /((?:api[-_]?key|authorization|token|secret|password)["']?\s*[:=]\s*["']?)[^\s,"'}]+/giu,
      '$1[REDACTED]',
    )
    .replace(/\bBearer\s+[^\s,"'}]+/giu, 'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/gu, 'sk-[REDACTED]')
    .replace(/[\r\n\t]+/gu, ' ')
    .slice(0, LOG_ERROR_DETAIL_LIMIT);
}

// 提取可排障的上游异常字段；内容会脱敏并限制长度，仅写服务端日志。
export function describeLogError(error: unknown): string {
  if (error instanceof HttpException && error.cause) return describeLogAgentUpstreamError(error);
  if (!(error instanceof Error)) return sanitizeLogDetail(error ?? '未知错误');
  const value = error as ErrorLike;
  const details = [`${value.name}: ${value.message}`];
  if (value.status !== undefined) details.push(`HTTP=${String(value.status)}`);
  else if (error instanceof HttpException) details.push(`HTTP=${String(error.getStatus())}`);
  if (value.code) details.push(`供应商错误码=${String(value.code)}`);
  if (value.type) details.push(`类型=${String(value.type)}`);
  const requestId = value.requestID ?? value.requestId;
  if (requestId) details.push(`请求ID=${String(requestId)}`);
  if (value.url) details.push(`上游=${String(value.url)}`);
  if (value.responseBody) details.push(`响应=${sanitizeLogDetail(value.responseBody)}`);
  if (value.cause && value.cause !== error) details.push(`根因=${describeLogError(value.cause)}`);
  return sanitizeLogDetail(details.join(' | '));
}

type AgentExceptionBody = { code?: unknown; detail?: unknown };

// Run 失败等场景：对外仍是包装后的 code/detail，日志里展开模型/供应商原始异常。
export function describeLogAgentUpstreamError(error: unknown): string {
  if (!(error instanceof HttpException)) return describeLogError(error);
  const response = error.getResponse();
  const wrapperParts = [`${error.name}: HTTP=${error.getStatus()}`];
  if (typeof response === 'object' && response !== null) {
    const body = response as AgentExceptionBody;
    if (body.code) wrapperParts.push(`对外码=${String(body.code)}`);
    if (body.detail) wrapperParts.push(`对外详情=${String(body.detail)}`);
  } else if (typeof response === 'string') {
    wrapperParts.push(`对外详情=${response}`);
  }
  const upstream = error.cause ? describeLogError(error.cause) : describeLogError(error);
  return sanitizeLogDetail(`${wrapperParts.join(' | ')} | 模型上游=${upstream}`);
}
