import type { ProblemDetails } from '@harness/agent-protocol';

// 创建用于契约测试的确定性错误响应。
export function createProblemDetailsFixture(
  overrides: Partial<ProblemDetails> = {},
): ProblemDetails {
  return {
    type: 'https://hello-harness.local/problems/not-implemented',
    title: 'Capability unavailable',
    status: 501,
    code: 'CAPABILITY_NOT_IMPLEMENTED',
    detail: 'This capability is not available in the foundation release.',
    ...overrides,
  };
}
