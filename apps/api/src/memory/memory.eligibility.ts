const SECRET_PATTERNS = [
  /\b(api[_-]?key|access[_-]?token|secret|password|passwd|credential)\b/i,
  /\b(sk-[a-z0-9]{10,}|Bearer\s+[a-z0-9._-]{8,})/i,
  /密码[:：]\s*\S+/,
  /密钥[:：]\s*\S+/,
];

const EXTERNAL_FACT_PATTERNS = [
  /(搜索|调研|查询|行情|股价|新闻|据.*报道|根据.*网站|搜索结果显示)/,
  /\b(search results?|according to the web)\b/i,
  /https?:\/\//i,
];

export type WriteEligibilityResult =
  | { ok: true }
  | { ok: false; reason: 'secret_suspected' | 'external_fact' | 'confidence_low' | 'limit_exceeded' };

export function evaluateMemoryWriteEligibility(input: {
  title: string;
  content: string;
  confidence?: 'low' | 'medium' | 'high';
  activeCount: number;
  activeCap: number;
}): WriteEligibilityResult {
  if (input.confidence === 'low') return { ok: false, reason: 'confidence_low' };
  const blob = `${input.title}\n${input.content}`;
  if (SECRET_PATTERNS.some((pattern) => pattern.test(blob))) {
    return { ok: false, reason: 'secret_suspected' };
  }
  if (EXTERNAL_FACT_PATTERNS.some((pattern) => pattern.test(blob))) {
    return { ok: false, reason: 'external_fact' };
  }
  if (input.activeCount >= input.activeCap) {
    return { ok: false, reason: 'limit_exceeded' };
  }
  return { ok: true };
}
