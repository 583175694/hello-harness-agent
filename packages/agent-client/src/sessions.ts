import {
  createSessionResponseSchema,
  deleteSessionResponseSchema,
  generateSessionTitleResponseSchema,
  listSessionsResponseSchema,
  sessionDetailResponseSchema,
  updateSessionResponseSchema,
  type DeleteSessionResponse,
  type GenerateSessionTitleResponse,
  type SessionDetailResponse,
  type SessionSummary,
  type UpdateSessionRequest,
} from '@harness/agent-protocol';
import type { ClientContext } from './types.js';

export function createSessionsApi(ctx: ClientContext) {
  async function createSession(title: string): Promise<SessionSummary> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    return createSessionResponseSchema.parse(await ctx.parseResponse(response)).session;
  }

  async function listSessions(signal?: AbortSignal): Promise<SessionSummary[]> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/sessions`, { signal });
    return listSessionsResponseSchema.parse(await ctx.parseResponse(response)).sessions;
  }

  async function getSession(
    sessionId: string,
    signal?: AbortSignal,
    options?: { limit?: number; before?: string },
  ): Promise<SessionDetailResponse> {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    if (options?.before) params.set('before', options.before);
    const query = params.toString();
    const response = await ctx.apiFetch(
      `${ctx.baseUrl}/api/agent/sessions/${sessionId}${query ? `?${query}` : ''}`,
      { signal },
    );
    return sessionDetailResponseSchema.parse(await ctx.parseResponse(response));
  }

  async function deleteSession(sessionId: string): Promise<DeleteSessionResponse> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/sessions/${sessionId}`, {
      method: 'DELETE',
    });
    return deleteSessionResponseSchema.parse(await ctx.parseResponse(response));
  }

  async function updateSession(
    sessionId: string,
    input: UpdateSessionRequest,
  ): Promise<SessionSummary> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return updateSessionResponseSchema.parse(await ctx.parseResponse(response)).session;
  }

  async function generateSessionTitle(sessionId: string): Promise<GenerateSessionTitleResponse> {
    const response = await ctx.apiFetch(
      `${ctx.baseUrl}/api/agent/sessions/${sessionId}/title/generate`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      },
    );
    return generateSessionTitleResponseSchema.parse(await ctx.parseResponse(response));
  }

  return {
    createSession,
    listSessions,
    getSession,
    deleteSession,
    updateSession,
    generateSessionTitle,
  };
}
