import { describe, expect, it } from 'vitest';

import { createToolRunStateKey, ToolRunState } from '../../../src/tools/tool-run-state';

describe('ToolRunState', () => {
  it('reuses a typed state slot within one run', () => {
    const key = createToolRunStateKey<{ count: number }>('counter');
    const runState = new ToolRunState();
    const first = runState.getOrCreate(key, () => ({ count: 1 }));
    const second = runState.getOrCreate(key, () => ({ count: 2 }));

    expect(second).toBe(first);
    expect(second.count).toBe(1);
  });

  it('isolates different keys and different runs', () => {
    const firstKey = createToolRunStateKey<{ value: string }>('first');
    const secondKey = createToolRunStateKey<{ value: string }>('second');
    const firstRun = new ToolRunState();
    const secondRun = new ToolRunState();

    expect(firstRun.getOrCreate(firstKey, () => ({ value: 'first-run' }))).not.toBe(
      firstRun.getOrCreate(secondKey, () => ({ value: 'second-key' })),
    );
    expect(secondRun.getOrCreate(firstKey, () => ({ value: 'second-run' }))).toEqual({
      value: 'second-run',
    });
  });
});
