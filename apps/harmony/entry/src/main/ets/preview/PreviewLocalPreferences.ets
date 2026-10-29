import { PreviewAuthProfile, PreviewComposerBlockKind } from './PreviewAuth';

export interface PreviewMcpServer {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

export interface PreviewMemoryEntry {
  id: string;
  text: string;
}

/** Phase A 本地假持久化（内存单例；DevEco 重启后重置）。 */
export class PreviewLocalPreferences {
  private static mcp: PreviewMcpServer[] = [
    { id: 'local-files', name: '本地文件（Preview）', url: 'stdio://preview-files', enabled: true },
    { id: 'local-search', name: '检索（Preview）', url: 'https://example.com/mcp', enabled: false },
  ];
  private static memory: PreviewMemoryEntry[] = [
    { id: 'mem-1', text: '用户偏好：简洁回答' },
    { id: 'mem-2', text: '常用项目：hello-harness-agent' },
  ];
  static apiUrl: string = 'https://api.example.com';
  static themeDark: boolean = false;
  static reduceMotion: boolean = false;
  static contentFontSize: number = 15;
  static memoryAllowWrite: boolean = true;
  static authProfile: PreviewAuthProfile | null = null;
  static composerBlockDemo: PreviewComposerBlockKind = PreviewComposerBlockKind.NONE;

  static get isLoggedIn(): boolean {
    return PreviewLocalPreferences.authProfile !== null;
  }

  static resolveComposerBlock(): PreviewComposerBlockKind {
    if (PreviewLocalPreferences.composerBlockDemo !== PreviewComposerBlockKind.NONE) {
      return PreviewLocalPreferences.composerBlockDemo;
    }
    if (PreviewLocalPreferences.apiUrl.trim().length > 0 && !PreviewLocalPreferences.isLoggedIn) {
      return PreviewComposerBlockKind.LOGIN_REQUIRED;
    }
    return PreviewComposerBlockKind.NONE;
  }

  static updateAuth(profile: PreviewAuthProfile | null): void {
    PreviewLocalPreferences.authProfile = profile;
  }

  static listMcp(): PreviewMcpServer[] {
    return PreviewLocalPreferences.mcp;
  }

  static upsertMcp(server: PreviewMcpServer): void {
    const idx = PreviewLocalPreferences.mcp.findIndex((s) => s.id === server.id);
    if (idx >= 0) {
      PreviewLocalPreferences.mcp[idx] = server;
    } else {
      PreviewLocalPreferences.mcp.push(server);
    }
  }

  static deleteMcp(id: string): void {
    PreviewLocalPreferences.mcp = PreviewLocalPreferences.mcp.filter((s) => s.id !== id);
  }

  static listMemory(): PreviewMemoryEntry[] {
    return PreviewLocalPreferences.memory;
  }

  static addMemory(text: string): void {
    PreviewLocalPreferences.memory.unshift({
      id: `mem-${Date.now()}`,
      text: text.trim(),
    });
  }

  static deleteMemory(id: string): void {
    PreviewLocalPreferences.memory = PreviewLocalPreferences.memory.filter((m) => m.id !== id);
  }
}
