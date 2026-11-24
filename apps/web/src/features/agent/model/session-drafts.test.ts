import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearAllSessionDrafts,
  clearSessionDraft,
  draftScopeKey,
  moveSessionDraft,
  readSessionDraft,
  writeSessionDraft,
} from './session-drafts';

describe('session-drafts', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('derives stable scope keys for sessions and draft mode', () => {
    expect(draftScopeKey(null)).toBe('draft');
    expect(draftScopeKey(undefined)).toBe('draft');
    expect(draftScopeKey('session-1')).toBe('session-1');
  });

  it('writes, reads, and clears drafts per scope', () => {
    writeSessionDraft('session-a', '未发送的内容 A');
    writeSessionDraft('session-b', '未发送的内容 B');

    expect(readSessionDraft('session-a')).toBe('未发送的内容 A');
    expect(readSessionDraft('session-b')).toBe('未发送的内容 B');
    expect(readSessionDraft('missing')).toBe('');

    clearSessionDraft('session-a');
    expect(readSessionDraft('session-a')).toBe('');
    expect(readSessionDraft('session-b')).toBe('未发送的内容 B');

    clearAllSessionDrafts();
    expect(readSessionDraft('session-b')).toBe('');
  });

  it('removes the entry when writing whitespace-only text', () => {
    writeSessionDraft('session-a', 'hello');
    writeSessionDraft('session-a', '   \n\t  ');
    expect(readSessionDraft('session-a')).toBe('');
    expect(window.sessionStorage.getItem('harness-session-drafts')).toBeNull();
  });

  it('moves draft from draft scope to a newly created session scope', () => {
    writeSessionDraft('draft', '带附件的任务说明');
    moveSessionDraft('draft', 'session-new');
    expect(readSessionDraft('draft')).toBe('');
    expect(readSessionDraft('session-new')).toBe('带附件的任务说明');
  });

  it('evicts oldest drafts past the 50-entry LRU cap', () => {
    for (let i = 1; i <= 55; i += 1) {
      writeSessionDraft(`s-${i}`, `draft ${i}`);
    }
    // 刷新 s-6，使其成为最近使用。
    writeSessionDraft('s-6', 'draft 6 updated');
    writeSessionDraft('s-56', 'draft 56');

    expect(readSessionDraft('s-1')).toBe('');
    expect(readSessionDraft('s-5')).toBe('');
    expect(readSessionDraft('s-7')).toBe('');
    expect(readSessionDraft('s-6')).toBe('draft 6 updated');
    expect(readSessionDraft('s-56')).toBe('draft 56');
  });

  it('caps individual draft text at 20,000 characters', () => {
    writeSessionDraft('long', 'a'.repeat(25_000));
    expect(readSessionDraft('long')).toHaveLength(20_000);
  });

  it('fails gracefully when sessionStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(() => writeSessionDraft('s-1', 'hello')).not.toThrow();
    expect(readSessionDraft('s-1')).toBe('');
    expect(() => clearSessionDraft('s-1')).not.toThrow();
    expect(() => clearAllSessionDrafts()).not.toThrow();
  });
});
