import { describe, expect, it } from 'vitest';

import {
  buildClientSearchSnippet,
  mergeConversationMatches,
  searchLocalConversation,
} from './conversation-search';
import type { ConversationItem } from './types';

describe('conversation-search', () => {
  it('builds snippets with accurate match offsets', () => {
    const longText = `${'前文内容'.repeat(20)} 这里出现了关键参数 timeout 配置说明 ${'后续补充'.repeat(25)}`;
    const result = buildClientSearchSnippet(longText, 'TIMEOUT');

    expect(result.snippet.startsWith('…')).toBe(true);
    expect(result.snippet.endsWith('…')).toBe(true);
    expect(
      result.snippet.slice(result.matchStart, result.matchStart + result.matchLength).toLowerCase(),
    ).toBe('timeout');
  });

  it('searches across user messages, skill mentions, and assistant text blocks', () => {
    const items: ConversationItem[] = [
      {
        id: 'u-1',
        kind: 'user',
        content: '帮我分析网关 timeout 报错',
        skillNames: ['debug-net'],
        createdAt: '2026-09-10T00:00:00.000Z',
      },
      {
        id: 'a-1',
        kind: 'assistant',
        blocks: [
          {
            id: 'r-1',
            type: 'reasoning',
            content: '思考过程 timeout',
            roundId: 'round-1',
            roundSequence: 1,
            blockSequence: 0,
          },
          { id: 't-1', type: 'text', content: '建议检查 Nginx proxy_read_timeout 设置。' },
        ],
        createdAt: '2026-09-10T00:00:05.000Z',
      },
      {
        id: 'u-2',
        kind: 'user',
        content: '谢谢',
        createdAt: '2026-09-10T00:01:00.000Z',
      },
    ];

    const matches = searchLocalConversation(items, 'timeout');
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({ messageId: 'u-1', renderIndex: 0, role: 'user' });
    expect(matches[1]).toMatchObject({ messageId: 'a-1', renderIndex: 1, role: 'assistant' });

    const skillMatches = searchLocalConversation(items, 'debug-net');
    expect(skillMatches).toHaveLength(1);
    expect(skillMatches[0]?.messageId).toBe('u-1');
  });

  it('merges unloaded remote history ahead of local matches without duplicates', () => {
    const local = [
      {
        messageId: 'm-new',
        renderIndex: 0,
        role: 'assistant' as const,
        snippet: '最新包含 cache 的回答',
        matchStart: 5,
        matchLength: 5,
      },
    ];
    const remote = [
      {
        messageId: 'm-old',
        sessionId: 's-1',
        sessionTitle: '测试',
        role: 'user' as const,
        snippet: '更早历史里的 cache 问题',
        matchStart: 7,
        matchLength: 5,
        createdAt: '2026-09-09T00:00:00.000Z',
      },
      {
        messageId: 'm-new',
        sessionId: 's-1',
        sessionTitle: '测试',
        role: 'assistant' as const,
        snippet: '重复项应被去重',
        matchStart: 0,
        matchLength: 2,
        createdAt: '2026-09-10T00:00:00.000Z',
      },
    ];

    const merged = mergeConversationMatches(local, remote, new Set(['m-new']));
    expect(merged.map((item) => ({ id: item.messageId, unloaded: Boolean(item.unloaded) }))).toEqual([
      { id: 'm-old', unloaded: true },
      { id: 'm-new', unloaded: false },
    ]);
  });
});
