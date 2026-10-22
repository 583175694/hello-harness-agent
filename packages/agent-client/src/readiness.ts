import { problemDetailsSchema, serviceStatusSchema, type ServiceStatus } from '@harness/agent-protocol';
import { ApiProblem } from './http.js';
import type { ClientContext } from './types.js';

export function createReadinessApi(ctx: ClientContext) {
  async function getReadiness(signal?: AbortSignal): Promise<ServiceStatus> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/readyz`, { signal });
    const data: unknown = await response.json();
    if (!response.ok) {
      throw new ApiProblem(problemDetailsSchema.parse(data));
    }
    return serviceStatusSchema.parse(data);
  }
  return { getReadiness };
}
