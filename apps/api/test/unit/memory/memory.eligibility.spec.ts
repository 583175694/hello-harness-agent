import { describe, expect, it } from 'vitest';
import { evaluateMemoryWriteEligibility } from '../../../src/memory/memory.eligibility';

describe('evaluateMemoryWriteEligibility', () => {
  it('rejects secret-like content', () => {
    const result = evaluateMemoryWriteEligibility({
      title: 'API Key',
      content: 'sk-abcdefghijklmnopqrstuvwxyz',
      activeCount: 0,
      activeCap: 50,
    });
    expect(result).toEqual({ ok: false, reason: 'secret_suspected' });
  });

  it('rejects external research facts', () => {
    const result = evaluateMemoryWriteEligibility({
      title: '股价',
      content: '根据搜索结果显示今日股价上涨',
      activeCount: 0,
      activeCap: 50,
    });
    expect(result).toEqual({ ok: false, reason: 'external_fact' });
  });

  it('rejects when active cap exceeded', () => {
    const result = evaluateMemoryWriteEligibility({
      title: '偏好',
      content: '喜欢简洁中文',
      activeCount: 50,
      activeCap: 50,
    });
    expect(result).toEqual({ ok: false, reason: 'limit_exceeded' });
  });
});
