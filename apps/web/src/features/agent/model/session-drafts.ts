const SESSION_DRAFTS_STORAGE_KEY = 'harness-session-drafts';
const MAX_STORED_DRAFTS = 50;
const MAX_DRAFT_LENGTH = 20_000;

type DraftStore = Record<string, string>;

function readStore(): DraftStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(SESSION_DRAFTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: DraftStore = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim()) {
        result[key] = value.slice(0, MAX_DRAFT_LENGTH);
      }
    }
    return result;
  } catch {
    return {};
  }
}

function writeStore(store: DraftStore): void {
  if (typeof window === 'undefined') return;
  try {
    const entries = Object.entries(store);
    if (entries.length === 0) {
      window.sessionStorage.removeItem(SESSION_DRAFTS_STORAGE_KEY);
      return;
    }
    const trimmed =
      entries.length > MAX_STORED_DRAFTS
        ? Object.fromEntries(entries.slice(entries.length - MAX_STORED_DRAFTS))
        : store;
    window.sessionStorage.setItem(SESSION_DRAFTS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // 忽略隐私模式或存储配额异常，避免影响正常输入体验。
  }
}

export function draftScopeKey(sessionId: string | null | undefined): string {
  return sessionId ?? 'draft';
}

export function readSessionDraft(scope: string): string {
  const store = readStore();
  return store[scope] ?? '';
}

export function writeSessionDraft(scope: string, text: string): void {
  const store = readStore();
  if (!text.trim()) {
    if (!(scope in store)) return;
    delete store[scope];
    writeStore(store);
    return;
  }
  const normalized = text.slice(0, MAX_DRAFT_LENGTH);
  // 重新插入到末尾以维持最近使用顺序（LRU）。
  if (scope in store) delete store[scope];
  store[scope] = normalized;
  writeStore(store);
}

export function clearSessionDraft(scope: string): void {
  const store = readStore();
  if (!(scope in store)) return;
  delete store[scope];
  writeStore(store);
}

export function moveSessionDraft(fromScope: string, toScope: string): void {
  if (fromScope === toScope) return;
  const store = readStore();
  const value = store[fromScope];
  if (!value || !value.trim()) return;
  delete store[fromScope];
  if (toScope in store) delete store[toScope];
  store[toScope] = value;
  writeStore(store);
}

export function clearAllSessionDrafts(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SESSION_DRAFTS_STORAGE_KEY);
  } catch {
    // 忽略存储访问异常。
  }
}
