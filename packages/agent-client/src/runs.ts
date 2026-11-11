import {
  cancelRunResponseSchema,
  createRunResponseSchema,
  runControlResponseSchema,
  runDetailResponseSchema,
  runSnapshotSchema,
  runToolOutputUrlResponseSchema,
  type CancelRunResponse,
  type CreateRunResponse,
  type ReasoningEffort,
  type RunControlCommand,
  type RunControlResponse,
  type RunDetailResponse,
  type RunSnapshot,
  type RunToolOutputUrlResponse,
} from '@harness/agent-protocol';
import { createClientId } from './client-id.js';
import type { ClientContext } from './types.js';

export function createRunsApi(ctx: ClientContext) {
  async function createRun(
    sessionId: string,
    content: string,
    model: string,
    reasoningEffort: ReasoningEffort,
    attachmentIds: string[] = [],
    artifactVersionContext?: {
      seriesId: string;
      baseArtifactId: string;
      expectedCurrentArtifactId: string;
      changeSummary?: string;
    },
    skillNames: string[] = [],
  ): Promise<CreateRunResponse> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/sessions/${sessionId}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content,
        model,
        reasoningEffort,
        idempotencyKey: createClientId(),
        ...(attachmentIds.length ? { attachmentIds } : {}),
        ...(artifactVersionContext ? { artifactVersionContext } : {}),
        ...(skillNames.length ? { skillNames } : {}),
      }),
    });
    return createRunResponseSchema.parse(await ctx.parseResponse(response));
  }

  async function getRun(runId: string, signal?: AbortSignal): Promise<RunSnapshot> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/runs/${runId}`, { signal });
    return runSnapshotSchema.parse(await ctx.parseResponse(response));
  }

  async function getRunDetail(runId: string, signal?: AbortSignal): Promise<RunDetailResponse> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/runs/${runId}/detail`, { signal });
    return runDetailResponseSchema.parse(await ctx.parseResponse(response));
  }

  async function getRunToolOutputUrl(
    runId: string,
    toolCallId: string,
    signal?: AbortSignal,
  ): Promise<RunToolOutputUrlResponse> {
    const response = await ctx.apiFetch(
      `${ctx.baseUrl}/api/agent/runs/${runId}/tools/${encodeURIComponent(toolCallId)}/output-url`,
      { signal },
    );
    return runToolOutputUrlResponseSchema.parse(await ctx.parseResponse(response));
  }

  async function cancelRun(runId: string): Promise<CancelRunResponse> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/runs/${runId}/cancel`, {
      method: 'POST',
    });
    return cancelRunResponseSchema.parse(await ctx.parseResponse(response));
  }

  async function controlRun(
    runId: string,
    command: RunControlCommand,
  ): Promise<RunControlResponse> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/runs/${runId}/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(command),
    });
    return runControlResponseSchema.parse(await ctx.parseResponse(response));
  }

  return {
    createRun,
    getRun,
    getRunDetail,
    getRunToolOutputUrl,
    cancelRun,
    controlRun,
  };
}
