import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SessionSummary } from '@harness/agent-protocol';

import { SearchDialog } from './search-dialog';

const sessions: SessionSummary[] = [
  {
    id: 'session-1',
    title: '网关 Timeout 排查',
    status: 'active',
    isPinned: false,
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T01:00:00.000Z',
  },
  {
    id: 'session-2',
    title: '季度财报总结',
    status: 'active',
    isPinned: false,
    createdAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T01:00:00.000Z',
  },
];

describe('SearchDialog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('filters local session titles immediately and merges debounced backend message hits', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          query: 'timeout',
          scope: 'all',
          sessions: [],
          messages: [
            {
              messageId: 'msg-99',
              sessionId: 'session-2',
              sessionTitle: '季度财报总结',
              role: 'assistant',
              snippet: '外部接口 timeout 导致数据抓取超时',
              matchStart: 5,
              matchLength: 7,
              createdAt: '2026-09-09T00:30:00.000Z',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const onJumpToMessage = vi.fn();
    render(
      <SearchDialog
        open
        onOpenChange={() => undefined}
        sessions={sessions}
        currentSessionId="session-1"
        currentSessionTitle="网关 Timeout 排查"
        currentConversation={[]}
        authenticated
        onSelectSession={() => undefined}
        onJumpToMessage={onJumpToMessage}
      />,
    );

    const input = screen.getByRole('textbox', { name: '搜索会话与消息' });
    fireEvent.change(input, { target: { value: 't' } });
    fireEvent.change(input, { target: { value: 'time' } });
    fireEvent.change(input, { target: { value: 'timeout' } });

    // 防抖期间不会立即发起多次请求，防抖结束后合并为一次请求并显示本地与远端结果。
    expect(fetchMock).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByRole('region', { name: '匹配的会话' })).toHaveTextContent('Timeout');
      expect(screen.getByRole('region', { name: '匹配的消息' })).toHaveTextContent(
        '外部接口 timeout 导致数据抓取超时',
      );
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /导致数据抓取超时/ }));
    expect(onJumpToMessage).toHaveBeenCalledWith({
      sessionId: 'session-2',
      messageId: 'msg-99',
      query: 'timeout',
    });
  });

  it('searches current conversation locally when switched to session scope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ query: 'redis', scope: 'session', sessions: [], messages: [] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const onJumpToMessage = vi.fn();
    render(
      <SearchDialog
        open
        onOpenChange={() => undefined}
        sessions={sessions}
        currentSessionId="session-1"
        currentSessionTitle="网关 Timeout 排查"
        currentConversation={[
          {
            id: 'msg-local-1',
            kind: 'user',
            content: '检查 Redis 连接池大小',
            createdAt: '2026-09-10T00:00:00.000Z',
          },
        ]}
        authenticated={false}
        onSelectSession={() => undefined}
        onJumpToMessage={onJumpToMessage}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '当前对话' }));
    fireEvent.change(screen.getByRole('textbox', { name: '搜索会话与消息' }), {
      target: { value: 'redis' },
    });

    await waitFor(() =>
      expect(screen.getByRole('region', { name: '匹配的消息' })).toHaveTextContent(
        '检查 Redis 连接池大小',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /连接池大小/ }));
    expect(onJumpToMessage).toHaveBeenCalledWith({
      sessionId: 'session-1',
      messageId: 'msg-local-1',
      query: 'redis',
    });
  });
});
