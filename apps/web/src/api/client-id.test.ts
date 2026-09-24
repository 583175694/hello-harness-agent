import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClientId } from './client';

afterEach(() => vi.unstubAllGlobals());

describe('createClientId', () => {
  it('uses native UUIDs when available', () => {
    const randomUUID = vi.fn(() => 'native-uuid');
    vi.stubGlobal('crypto', { randomUUID });
    expect(createClientId()).toBe('native-uuid');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('generates UUID v4 on HTTP without crypto.randomUUID', () => {
    const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    vi.stubGlobal('crypto', { getRandomValues });
    const values = Array.from({ length: 100 }, () => createClientId());
    expect(new Set(values).size).toBe(100);
    for (const value of values) {
      expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});
