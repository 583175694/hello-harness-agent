import type { SessionSearchMessageHit } from '../../../api/client';
import { resolveUserMessageDisplay } from '../user-message-skills';
import { flattenAssistantText } from './conversation-blocks';
import type { ConversationItem } from './types';

export type ConversationSearchMatch = {
  messageId: string;
  renderIndex: number | null;
  role: 'user' | 'assistant';
  snippet: string;
  matchStart: number;
  matchLength: number;
  createdAt?: string;
  unloaded?: boolean;
};

export function buildClientSearchSnippet(
  text: string,
  query: string,
): { snippet: string; matchStart: number; matchLength: number } {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const trimmedQuery = query.trim();
  if (!normalized || !trimmedQuery) {
    const snippet = normalized.length > 120 ? `${normalized.slice(0, 120)}…` : normalized;
    return { snippet, matchStart: 0, matchLength: 0 };
  }
  const idx = normalized.toLowerCase().indexOf(trimmedQuery.toLowerCase());
  if (idx < 0) {
    const snippet = normalized.length > 120 ? `${normalized.slice(0, 120)}…` : normalized;
    return { snippet, matchStart: 0, matchLength: 0 };
  }
  const start = Math.max(0, idx - 36);
  const end = Math.min(normalized.length, idx + trimmedQuery.length + 72);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < normalized.length ? '…' : '';
  return {
    snippet: `${prefix}${normalized.slice(start, end)}${suffix}`,
    matchStart: prefix.length + (idx - start),
    matchLength: trimmedQuery.length,
  };
}

export function extractConversationItemSearchText(item: ConversationItem): string {
  if (item.kind === 'user') {
    const display = resolveUserMessageDisplay({
      content: item.content,
      skillNames: item.skillNames,
    });
    const skillPrefix = display.skillNames.map((name) => `/${name}`).join(' ');
    return [skillPrefix, display.body].filter(Boolean).join(' ');
  }
  return flattenAssistantText(item.blocks);
}

/**
 * 在前端当前已加载（含虚拟列表未挂载及流式生成中）的对话消息中检索关键词。
 */
export function searchLocalConversation(
  items: ReadonlyArray<ConversationItem>,
  query: string,
): ConversationSearchMatch[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const lowerQuery = trimmed.toLowerCase();
  const matches: ConversationSearchMatch[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    const text = extractConversationItemSearchText(item);
    if (!text) continue;
    if (!text.toLowerCase().includes(lowerQuery)) continue;
    const { snippet, matchStart, matchLength } = buildClientSearchSnippet(text, trimmed);
    matches.push({
      messageId: item.id,
      renderIndex: index,
      role: item.kind,
      snippet,
      matchStart,
      matchLength,
      createdAt: item.createdAt,
    });
  }
  return matches;
}

/**
 * 将后端返回的未分页历史消息命中结果前置合并到本地命中列表，避免与已加载消息重复。
 */
export function mergeConversationMatches(
  localMatches: ReadonlyArray<ConversationSearchMatch>,
  remoteMessages: ReadonlyArray<SessionSearchMessageHit>,
  loadedMessageIds: ReadonlySet<string>,
): ConversationSearchMatch[] {
  const unloadedOlder: ConversationSearchMatch[] = [];
  for (const hit of remoteMessages) {
    if (loadedMessageIds.has(hit.messageId)) continue;
    unloadedOlder.push({
      messageId: hit.messageId,
      renderIndex: null,
      role: hit.role,
      snippet: hit.snippet,
      matchStart: hit.matchStart,
      matchLength: hit.matchLength,
      createdAt: hit.createdAt,
      unloaded: true,
    });
  }
  return [...unloadedOlder, ...localMatches];
}
