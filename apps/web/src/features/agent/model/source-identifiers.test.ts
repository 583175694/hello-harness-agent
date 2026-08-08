import { describe, expect, it } from 'vitest';

import { nextSourceNumber } from './source-identifiers';

describe('source identifiers', () => {
  it('keeps increasing after a clue has been upgraded and removed', () => {
    expect(nextSourceNumber([{ id: 'R2' }, { id: 'F1' }], 'R')).toBe(3);
    expect(nextSourceNumber([{ id: 'R9' }, { id: 'R3' }, { id: 'F4' }], 'R')).toBe(10);
    expect(nextSourceNumber([{ id: 'R9' }, { id: 'F4' }], 'F')).toBe(5);
  });
});
