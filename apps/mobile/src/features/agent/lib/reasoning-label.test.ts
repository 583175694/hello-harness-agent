import { describe, expect, it } from 'vitest';
import { reasoningTriggerLabel } from './reasoning-label';

describe('reasoningTriggerLabel', () => {
  it('matches Web copy for streaming and completed states', () => {
    expect(reasoningTriggerLabel(true)).toBe('Thinking...');
    expect(reasoningTriggerLabel(false)).toBe('Thought');
    expect(reasoningTriggerLabel(false, 4500)).toBe('Thought for 5 seconds');
    expect(reasoningTriggerLabel(false, 0)).toBe('Thought for 0 seconds');
  });
});
