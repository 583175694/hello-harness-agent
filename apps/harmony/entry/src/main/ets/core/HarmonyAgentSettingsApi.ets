import { HarnessAgentHttp } from './HarnessAgentHttp';
import { PreviewLocalPreferences, PreviewMcpServer, PreviewMemoryEntry } from '../preview/PreviewLocalPreferences';

export interface MemorySettingsRow {
  allowAgentWrite: boolean;
}

export interface MemoryRecordRow {
  memoryId: string;
  title: string;
  summary: string;
}

export interface McpServerApiRow {
  id: string;
  serverName: string;
  url: string;
  enabled: boolean;
}

/** Settings MCP/Memory 薄 HTTP（Core 联调；Preview 仍走 PreviewLocalPreferences）。 */
export class HarmonyAgentSettingsApi {
  static coreApiEnabled(): boolean {
    const base = HarnessAgentHttp.baseUrl();
    if (base.length === 0) {
      return false;
    }
    return PreviewLocalPreferences.useCorePort || PreviewLocalPreferences.isLoggedIn;
  }

  static async loadMemoryHub(): Promise<{ allowWrite: boolean; entries: PreviewMemoryEntry[] }> {
    const settings = await HarnessAgentHttp.getJson<MemorySettingsRow>('/api/agent/memory-settings');
    const list = await HarnessAgentHttp.getJson<{ memories: MemoryRecordRow[] }>('/api/agent/memories');
    const entries = (list.memories ?? []).map((m) => ({
      id: m.memoryId,
      text: (m.summary?.length ?? 0) > 0 ? m.summary : m.title,
    }));
    return { allowWrite: settings.allowAgentWrite ?? true, entries };
  }

  static async patchMemorySettings(allowAgentWrite: boolean): Promise<void> {
    await HarnessAgentHttp.patchJson('/api/agent/memory-settings', { allowAgentWrite });
  }

  static async deleteMemory(memoryId: string): Promise<void> {
    await HarnessAgentHttp.delete(`/api/agent/memories/${memoryId}`);
  }

  static async listMcpServers(): Promise<PreviewMcpServer[]> {
    const response = await HarnessAgentHttp.getJson<{ servers: McpServerApiRow[] }>('/api/agent/mcp/servers');
    return (response.servers ?? []).map((s) => ({
      id: s.id,
      name: s.serverName,
      url: s.url,
      enabled: s.enabled,
    }));
  }

  static async saveMcpServer(
    id: string | undefined,
    serverName: string,
    url: string,
    enabled: boolean,
  ): Promise<void> {
    const body = { serverName: serverName.trim(), url: url.trim(), enabled };
    if (id !== undefined && id.length > 0) {
      await HarnessAgentHttp.putJson(`/api/agent/mcp/servers/${id}`, body);
      return;
    }
    await HarnessAgentHttp.postJson('/api/agent/mcp/servers', body);
  }

  static async deleteMcpServer(id: string): Promise<void> {
    await HarnessAgentHttp.delete(`/api/agent/mcp/servers/${id}`);
  }

  static async testMcpServer(id: string): Promise<string> {
    const result = await HarnessAgentHttp.postJson<{ ok: boolean; toolNames?: string[]; error?: string }>(
      `/api/agent/mcp/servers/${id}/test`,
      {},
    );
    if (result.ok) {
      const count = result.toolNames?.length ?? 0;
      return `连接成功（${count} 个工具）`;
    }
    return result.error ?? '连接失败';
  }
}
