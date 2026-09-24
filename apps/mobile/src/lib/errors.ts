import { ApiProblem } from '@harness/agent-client';

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiProblem) return error.problem.detail || error.message;
  if (error instanceof Error) return error.message;
  return '请求暂时无法完成。';
}
