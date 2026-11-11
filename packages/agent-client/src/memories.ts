import {
  memoryListResponseSchema,
  memoryRecordViewSchema,
  memorySettingsViewSchema,
  type MemoryListResponse,
  type MemoryRecordView,
  type MemorySettingsView,
} from '@harness/agent-protocol';
import type { ClientContext } from './types.js';

export function createMemoriesApi(ctx: ClientContext) {
  async function listMemories(signal?: AbortSignal): Promise<MemoryListResponse> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/memories`, { signal });
    return memoryListResponseSchema.parse(await ctx.parseResponse(response));
  }

  async function createMemory(body: {
    kind: string;
    title: string;
    content: string;
  }): Promise<MemoryRecordView> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/memories`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await ctx.parseResponse(response)) as { memory: unknown };
    return memoryRecordViewSchema.parse(data.memory);
  }

  async function updateMemory(
    memoryId: string,
    body: { kind: string; title: string; content: string },
  ): Promise<MemoryRecordView> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/memories/${memoryId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await ctx.parseResponse(response)) as { memory: unknown };
    return memoryRecordViewSchema.parse(data.memory);
  }

  async function deleteMemory(memoryId: string): Promise<void> {
    await ctx.apiFetch(`${ctx.baseUrl}/api/agent/memories/${memoryId}`, { method: 'DELETE' });
  }

  async function readMemorySettings(signal?: AbortSignal): Promise<MemorySettingsView> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/memory-settings`, { signal });
    return memorySettingsViewSchema.parse(await ctx.parseResponse(response));
  }

  async function patchMemorySettings(body: {
    allowAgentWrite: boolean;
  }): Promise<MemorySettingsView> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/memory-settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return memorySettingsViewSchema.parse(await ctx.parseResponse(response));
  }

  return {
    listMemories,
    createMemory,
    updateMemory,
    deleteMemory,
    readMemorySettings,
    patchMemorySettings,
  };
}
