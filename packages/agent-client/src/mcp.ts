import {
  mcpCreateServerRequestSchema,
  mcpServerListResponseSchema,
  mcpServerTestResponseSchema,
  mcpServerViewSchema,
  type McpCreateServerRequest,
  type McpPatchServerRequest,
  type McpServerListResponse,
  type McpServerTestResponse,
  type McpServerView,
  type McpUpdateServerRequest,
} from '@harness/agent-protocol';
import type { ClientContext } from './types.js';

export function createMcpApi(ctx: ClientContext) {
  async function listMcpServers(signal?: AbortSignal): Promise<McpServerListResponse> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/mcp/servers`, { signal });
    return mcpServerListResponseSchema.parse(await ctx.parseResponse(response));
  }

  async function createMcpServer(body: McpCreateServerRequest): Promise<McpServerView> {
    mcpCreateServerRequestSchema.parse(body);
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/mcp/servers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return mcpServerViewSchema.parse(await ctx.parseResponse(response));
  }

  async function updateMcpServer(id: string, body: McpUpdateServerRequest): Promise<McpServerView> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/mcp/servers/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return mcpServerViewSchema.parse(await ctx.parseResponse(response));
  }

  async function patchMcpServer(id: string, body: McpPatchServerRequest): Promise<McpServerView> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/mcp/servers/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return mcpServerViewSchema.parse(await ctx.parseResponse(response));
  }

  async function deleteMcpServer(id: string): Promise<void> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/mcp/servers/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) await ctx.parseResponse(response);
  }

  async function testMcpServer(id: string): Promise<McpServerTestResponse> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/mcp/servers/${id}/test`, {
      method: 'POST',
    });
    return mcpServerTestResponseSchema.parse(await ctx.parseResponse(response));
  }

  return {
    listMcpServers,
    createMcpServer,
    updateMcpServer,
    patchMcpServer,
    deleteMcpServer,
    testMcpServer,
  };
}
