import { AGENT_PROTOCOL_LIMITS } from '@harness/agent-protocol';

export function makeProvisionalTitle(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return '新会话';
  return trimmed.slice(0, AGENT_PROTOCOL_LIMITS.sessionTitleMaxLength);
}

export function sortSessionSummaries<T extends { updatedAt: string; isPinned?: boolean }>(
  sessions: T[],
): T[] {
  return [...sessions].sort((a, b) => {
    if (Boolean(a.isPinned) !== Boolean(b.isPinned)) return a.isPinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}
