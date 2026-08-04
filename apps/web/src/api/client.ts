import { problemDetailsSchema, serviceStatusSchema } from '@harness/agent-protocol';
import type { ProblemDetails, ServiceStatus } from '@harness/agent-protocol';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiProblem extends Error {
  constructor(readonly problem: ProblemDetails) {
    super(problem.detail);
    this.name = 'ApiProblem';
  }
}

export async function getReadiness(signal?: AbortSignal): Promise<ServiceStatus> {
  const response = await fetch(`${apiBaseUrl}/readyz`, { signal });
  const data: unknown = await response.json();

  if (!response.ok) {
    throw new ApiProblem(problemDetailsSchema.parse(data));
  }

  return serviceStatusSchema.parse(data);
}

export async function requestSession(prompt: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/agent/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const data: unknown = await response.json();
    throw new ApiProblem(problemDetailsSchema.parse(data));
  }
}
