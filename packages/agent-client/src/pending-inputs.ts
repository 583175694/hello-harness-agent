import { createRunResponseSchema, type CreateRunResponse } from '@harness/agent-protocol';
import { createClientId } from './client-id.js';
import type { ClientContext } from './types.js';

export function createPendingInputsApi(ctx: ClientContext) {
  async function submitPendingInput(sessionId: string, content: string): Promise<unknown> {
    const response = await ctx.apiFetch(
      `${ctx.baseUrl}/api/agent/sessions/${sessionId}/pending-inputs`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content, idempotencyKey: createClientId() }),
      },
    );
    return ctx.parseResponse(response);
  }

  async function promotePendingInput(inputId: string): Promise<unknown> {
    const response = await ctx.apiFetch(
      `${ctx.baseUrl}/api/agent/pending-inputs/${inputId}/steer`,
      { method: 'POST' },
    );
    return ctx.parseResponse(response);
  }

  async function cancelPendingInput(inputId: string): Promise<unknown> {
    const response = await ctx.apiFetch(
      `${ctx.baseUrl}/api/agent/pending-inputs/${inputId}/cancel`,
      { method: 'POST' },
    );
    return ctx.parseResponse(response);
  }

  async function resumePendingQueue(sessionId: string): Promise<CreateRunResponse> {
    const response = await ctx.apiFetch(
      `${ctx.baseUrl}/api/agent/sessions/${sessionId}/pending-inputs/resume`,
      { method: 'POST' },
    );
    return createRunResponseSchema.parse(await ctx.parseResponse(response));
  }

  async function sendPendingInput(inputId: string): Promise<CreateRunResponse> {
    const response = await ctx.apiFetch(
      `${ctx.baseUrl}/api/agent/pending-inputs/${inputId}/send`,
      { method: 'POST' },
    );
    return createRunResponseSchema.parse(await ctx.parseResponse(response));
  }

  return {
    submitPendingInput,
    promotePendingInput,
    cancelPendingInput,
    resumePendingQueue,
    sendPendingInput,
  };
}
