import { describe, expect, it } from 'vitest';
import { ActivatedToolPool } from '../../../src/tools/tool-exposure/activated-tool-pool';

describe('ActivatedToolPool', () => {
  it('appends activated tools in insertion order without mid-Run eviction', () => {
    const pool = new ActivatedToolPool(4);

    pool.activate(['mcp__srv__b', 'mcp__srv__a'], 1);
    pool.activate(['mcp__srv__c'], 2);
    expect([...pool.asSet()]).toEqual(['mcp__srv__b', 'mcp__srv__a', 'mcp__srv__c']);

    // Re-activating existing tools does not reorder or duplicate them
    pool.activate(['mcp__srv__a', 'mcp__srv__d'], 3);
    expect([...pool.asSet()]).toEqual([
      'mcp__srv__b',
      'mcp__srv__a',
      'mcp__srv__c',
      'mcp__srv__d',
    ]);
  });

  it('enforces hard cap without evicting already activated prefix tools', () => {
    const pool = new ActivatedToolPool(2);

    pool.activate(['mcp__srv__a', 'mcp__srv__b'], 1);
    pool.activate(['mcp__srv__c'], 2);
    expect([...pool.asSet()]).toEqual(['mcp__srv__a', 'mcp__srv__b']);
    expect(pool.size).toBe(2);
  });
});
