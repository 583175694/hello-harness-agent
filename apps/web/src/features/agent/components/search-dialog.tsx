import { ArrowRight, LoaderCircle, MessageSquare, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import type { SessionSummary } from '@harness/agent-protocol';

import { searchSessionsAndMessages, type SessionSearchMessageHit } from '../../../api/client';
import { Dialog, DialogContent, DialogTitle } from '../../../components/ui/dialog';
import {
  mergeConversationMatches,
  searchLocalConversation,
} from '../model/conversation-search';
import type { ConversationItem } from '../model/types';

type SearchScope = 'all' | 'session';

type SearchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery?: string;
  sessions: SessionSummary[];
  currentSessionId: string | null;
  currentSessionTitle?: string;
  currentConversation: ConversationItem[];
  authenticated: boolean;
  onSelectSession: (sessionId: string) => void;
  onJumpToMessage: (target: { sessionId: string; messageId: string; query: string }) => void;
};

type SearchResultEntry =
  | { kind: 'session'; session: SessionSummary }
  | {
      kind: 'message';
      messageId: string;
      sessionId: string;
      sessionTitle: string;
      role: 'user' | 'assistant';
      snippet: string;
      matchStart: number;
      matchLength: number;
      createdAt?: string;
      unloaded?: boolean;
    };

function HighlightRangeText({
  text,
  start,
  length,
}: {
  text: string;
  start: number;
  length: number;
}) {
  if (length <= 0 || start < 0 || start >= text.length) {
    return <>{text}</>;
  }
  const end = Math.min(text.length, start + length);
  return (
    <>
      {text.slice(0, start)}
      <mark className="search-highlight">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

function HighlightQueryText({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return <HighlightRangeText text={text} start={idx} length={trimmed.length} />;
}

function formatShortDate(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date);
}

export function SearchDialog({
  open,
  onOpenChange,
  initialQuery = '',
  sessions,
  currentSessionId,
  currentSessionTitle,
  currentConversation,
  authenticated,
  onSelectSession,
  onJumpToMessage,
}: SearchDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [isComposing, setIsComposing] = useState(false);
  const [scope, setScope] = useState<SearchScope>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [remoteState, setRemoteState] = useState<{
    key: string;
    scope: SearchScope;
    loading: boolean;
    sessions: SessionSummary[];
    messages: SessionSearchMessageHit[];
    error: string | null;
  }>({
    key: '',
    scope: 'all',
    loading: false,
    sessions: [],
    messages: [],
    error: null,
  });

  const canSearchCurrentSession = Boolean(currentSessionId || currentConversation.length > 0);

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setDebouncedQuery(initialQuery);
    setIsComposing(false);
    setScope('all');
    setActiveIndex(0);
  }, [initialQuery, open]);

  useEffect(() => {
    if (!open) return undefined;
    if (!query.trim()) {
      setDebouncedQuery('');
      return undefined;
    }
    if (isComposing) return undefined;
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
      setActiveIndex(0);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [isComposing, open, query]);

  const trimmedQuery = debouncedQuery.trim();
  const requestKey =
    open && trimmedQuery && authenticated && (scope === 'all' || currentSessionId)
      ? `${scope}:${currentSessionId ?? ''}:${trimmedQuery}`
      : '';

  useEffect(() => {
    if (!requestKey) {
      setRemoteState({
        key: '',
        scope,
        loading: false,
        sessions: [],
        messages: [],
        error: null,
      });
      return undefined;
    }

    const controller = new AbortController();
    setRemoteState((current) => ({
      key: requestKey,
      scope,
      loading: true,
      // 同一搜索范围下保留上一轮结果直到新结果到达，避免每输入一个字符列表塌陷跳动。
      sessions: current.scope === scope ? current.sessions : [],
      messages: current.scope === scope ? current.messages : [],
      error: null,
    }));

    void searchSessionsAndMessages(
      {
        query: trimmedQuery,
        scope,
        sessionId: scope === 'session' ? (currentSessionId ?? undefined) : undefined,
        limit: 30,
      },
      controller.signal,
    )
      .then((response) => {
        if (controller.signal.aborted) return;
        setRemoteState({
          key: requestKey,
          scope,
          loading: false,
          sessions: response.sessions,
          messages: response.messages,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setRemoteState({
          key: requestKey,
          scope,
          loading: false,
          sessions: [],
          messages: [],
          error: err instanceof Error ? err.message : '搜索请求失败，请稍后重试。',
        });
      });

    return () => {
      controller.abort();
    };
  }, [authenticated, currentSessionId, requestKey, scope, trimmedQuery]);

  const localSessionHits = useMemo(() => {
    if (!trimmedQuery || scope !== 'all') return [];
    const lower = trimmedQuery.toLowerCase();
    return sessions.filter((session) => session.title.toLowerCase().includes(lower)).slice(0, 20);
  }, [scope, sessions, trimmedQuery]);

  const localMessageHits = useMemo(() => {
    if (!trimmedQuery || scope !== 'session') return [];
    return searchLocalConversation(currentConversation, trimmedQuery);
  }, [currentConversation, scope, trimmedQuery]);

  const mergedSessions = useMemo(() => {
    if (scope !== 'all') return [];
    const byId = new Map<string, SessionSummary>();
    for (const item of localSessionHits) byId.set(item.id, item);
    if (remoteState.scope === scope && remoteState.key) {
      for (const item of remoteState.sessions) {
        if (!byId.has(item.id)) byId.set(item.id, item);
      }
    }
    return [...byId.values()];
  }, [localSessionHits, remoteState.key, remoteState.scope, remoteState.sessions, scope]);

  const mergedMessages = useMemo<Array<Extract<SearchResultEntry, { kind: 'message' }>>>(() => {
    if (!trimmedQuery) return [];
    if (scope === 'session') {
      const loadedIds = new Set(currentConversation.map((item) => item.id));
      const remoteMessages =
        remoteState.scope === 'session' && remoteState.key ? remoteState.messages : [];
      const merged = mergeConversationMatches(localMessageHits, remoteMessages, loadedIds);
      return merged.map((hit) => ({
        kind: 'message',
        messageId: hit.messageId,
        sessionId: currentSessionId ?? '',
        sessionTitle: currentSessionTitle ?? '当前对话',
        role: hit.role,
        snippet: hit.snippet,
        matchStart: hit.matchStart,
        matchLength: hit.matchLength,
        createdAt: hit.createdAt,
        unloaded: hit.unloaded,
      }));
    }
    if (remoteState.scope !== 'all' || !remoteState.key) return [];
    return remoteState.messages.map((hit) => ({
      kind: 'message',
      messageId: hit.messageId,
      sessionId: hit.sessionId,
      sessionTitle: hit.sessionTitle,
      role: hit.role,
      snippet: hit.snippet,
      matchStart: hit.matchStart,
      matchLength: hit.matchLength,
      createdAt: hit.createdAt,
    }));
  }, [
    currentConversation,
    currentSessionId,
    currentSessionTitle,
    localMessageHits,
    remoteState.key,
    remoteState.messages,
    remoteState.scope,
    scope,
    trimmedQuery,
  ]);

  const entries = useMemo<SearchResultEntry[]>(
    () => [
      ...mergedSessions.map((session) => ({ kind: 'session' as const, session })),
      ...mergedMessages,
    ],
    [mergedMessages, mergedSessions],
  );

  const boundedActiveIndex = entries.length > 0 ? Math.min(activeIndex, entries.length - 1) : 0;

  const activateEntry = useCallback(
    (entry: SearchResultEntry) => {
      onOpenChange(false);
      if (entry.kind === 'session') {
        onSelectSession(entry.session.id);
        return;
      }
      onJumpToMessage({
        sessionId: entry.sessionId,
        messageId: entry.messageId,
        query: trimmedQuery,
      });
    },
    [onJumpToMessage, onOpenChange, onSelectSession, trimmedQuery],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      if (!entries.length) return;
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % entries.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      if (!entries.length) return;
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + entries.length) % entries.length);
      return;
    }
    if (event.key === 'Enter') {
      const target = entries[boundedActiveIndex];
      if (!target) return;
      event.preventDefault();
      activateEntry(target);
    }
  };

  const isLoading = Boolean(requestKey && remoteState.loading && remoteState.key === requestKey);
  const remoteError = remoteState.key === requestKey ? remoteState.error : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="settings"
        className="search-dialog"
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">搜索会话与消息</DialogTitle>
        <div className="search-dialog__header">
          <Search className="search-dialog__icon" size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className="search-dialog__input"
            aria-label="搜索会话与消息"
            placeholder={
              scope === 'all' ? '搜索会话标题或历史对话内容…' : '在当前对话中搜索消息…'
            }
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={(event) => {
              setIsComposing(false);
              setQuery(event.currentTarget.value);
            }}
            onKeyDown={handleKeyDown}
          />
          {isLoading ? (
            <LoaderCircle className="spin search-dialog__spinner" size={15} aria-label="正在搜索" />
          ) : null}
          {query ? (
            <button
              type="button"
              className="search-dialog__clear"
              aria-label="清空搜索词"
              onClick={() => {
                setQuery('');
                setDebouncedQuery('');
                setActiveIndex(0);
                inputRef.current?.focus();
              }}
            >
              <X size={14} />
            </button>
          ) : null}
        </div>

        <div className="search-dialog__toolbar">
          <div className="search-dialog__scopes" role="group" aria-label="搜索范围">
            <button
              type="button"
              className={`search-dialog__scope-pill${scope === 'all' ? ' is-active' : ''}`}
              aria-pressed={scope === 'all'}
              onClick={() => {
                setScope('all');
                setActiveIndex(0);
              }}
            >
              全部会话
            </button>
            <button
              type="button"
              className={`search-dialog__scope-pill${scope === 'session' ? ' is-active' : ''}`}
              aria-pressed={scope === 'session'}
              disabled={!canSearchCurrentSession}
              onClick={() => {
                setScope('session');
                setActiveIndex(0);
              }}
            >
              当前对话
            </button>
          </div>
          <span className="search-dialog__hint">↑↓ 选择 · Enter 跳转</span>
        </div>

        <div className="search-dialog__body">
          {!trimmedQuery ? (
            <div className="search-dialog__empty">
              <span>输入关键词，支持检索会话标题与全部历史消息正文。</span>
            </div>
          ) : null}

          {trimmedQuery && remoteError ? (
            <div className="search-dialog__error" role="alert">
              {remoteError}
            </div>
          ) : null}

          {trimmedQuery && mergedSessions.length > 0 ? (
            <section className="search-dialog__group" aria-label="匹配的会话">
              <div className="search-dialog__group-title">会话</div>
              {mergedSessions.map((session, idx) => {
                const isActive = boundedActiveIndex === idx;
                return (
                  <button
                    key={session.id}
                    type="button"
                    className={`search-dialog__row${isActive ? ' is-active' : ''}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => activateEntry({ kind: 'session', session })}
                  >
                    <MessageSquare size={15} className="search-dialog__row-icon" aria-hidden="true" />
                    <span className="search-dialog__row-main">
                      <span className="search-dialog__row-title">
                        <HighlightQueryText text={session.title} query={trimmedQuery} />
                      </span>
                    </span>
                    <span className="search-dialog__row-meta">
                      {formatShortDate(session.updatedAt)}
                    </span>
                  </button>
                );
              })}
            </section>
          ) : null}

          {trimmedQuery && mergedMessages.length > 0 ? (
            <section className="search-dialog__group" aria-label="匹配的消息">
              <div className="search-dialog__group-title">消息内容</div>
              {mergedMessages.map((hit, idx) => {
                const flatIndex = mergedSessions.length + idx;
                const isActive = boundedActiveIndex === flatIndex;
                return (
                  <button
                    key={`${hit.sessionId}-${hit.messageId}`}
                    type="button"
                    className={`search-dialog__row search-dialog__row--message${isActive ? ' is-active' : ''}`}
                    onMouseEnter={() => setActiveIndex(flatIndex)}
                    onClick={() => activateEntry(hit)}
                  >
                    <span className="search-dialog__row-main">
                      <span className="search-dialog__row-header">
                        {scope === 'all' ? (
                          <span className="search-dialog__row-session">{hit.sessionTitle}</span>
                        ) : null}
                        <span className="search-dialog__row-role">
                          {hit.role === 'user' ? '你' : 'AI'}
                        </span>
                        {hit.unloaded ? (
                          <span className="search-dialog__row-badge">更早历史</span>
                        ) : null}
                        {hit.createdAt ? (
                          <span className="search-dialog__row-meta">
                            {formatShortDate(hit.createdAt)}
                          </span>
                        ) : null}
                      </span>
                      <span className="search-dialog__row-snippet">
                        <HighlightRangeText
                          text={hit.snippet}
                          start={hit.matchStart}
                          length={hit.matchLength}
                        />
                      </span>
                    </span>
                    <ArrowRight size={14} className="search-dialog__row-arrow" aria-hidden="true" />
                  </button>
                );
              })}
            </section>
          ) : null}

          {trimmedQuery && !isLoading && entries.length === 0 && !remoteError ? (
            <div className="search-dialog__empty">
              <span>未找到包含“{trimmedQuery}”的结果</span>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
