import { problemDetailsSchema, type ProblemDetails } from '@harness/agent-protocol';
import type { ApiClientConfig, ClientContext } from './types.js';

export class ApiProblem extends Error {
  constructor(readonly problem: ProblemDetails) {
    super(problem.detail);
    this.name = 'ApiProblem';
  }
}

export function createClientContext(config: ApiClientConfig): ClientContext {
  const baseUrl = config.baseUrl.replace(/\/$/, '');
  const fetchFn = config.fetch ?? fetch;
  const credentials = config.credentials;

  async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const authHeaders = config.getAuthHeaders ? await config.getAuthHeaders() : {};
    const headers = new Headers(init?.headers);
    for (const [key, value] of Object.entries(authHeaders)) {
      headers.set(key, value);
    }
    return fetchFn(input, {
      ...init,
      credentials: init?.credentials ?? credentials,
      headers,
    });
  }

  async function parseResponse(response: Response): Promise<unknown> {
    const data: unknown = await response.json();
    if (!response.ok) throw new ApiProblem(problemDetailsSchema.parse(data));
    return data;
  }

  return { baseUrl, apiFetch, parseResponse };
}
