import { describe, expect, it } from 'vitest';
import { ActivatedToolPool } from '../../../src/tools/tool-exposure/activated-tool-pool';

describe('ActivatedToolPool', () => {
  it('keeps newly searched tools for the next round, then evicts uninvoked ones on round+2', () => {
    const pool = new ActivatedToolPool(8);

    // Round 1: tool_search returns A and B
    pool.activate(['mcp__srv__a', 'mcp__srv__b'], 1);
    expect(pool.asSet()).toEqual(new Set(['mcp__srv__a', 'mcp__srv__b']));

    // Start of Round 2: both must remain available so model can call them
    expect(pool.evictStaleUninvoked(2)).toEqual([]);
    expect(pool.size).toBe(2);

    // During Round 2: model invokes A, ignores B
    pool.markInvoked('mcp__srv__a', 2);

    // Start of Round 3: B was never invoked -> evicted; A was invoked -> kept
    expect(pool.evictStaleUninvoked(3)).toEqual(['mcp__srv__b']);
    expect(pool.asSet()).toEqual(new Set(['mcp__srv__a']));
  });

  it('enforces hard cap by evicting oldest uninvoked tools first, then LRU invoked tools', () => {
    const pool = new ActivatedToolPool(3);

    pool.activate(['mcp__srv__a', 'mcp__srv__b', 'mcp__srv__c'], 1);
    pool.markInvoked('mcp__srv__a', 1);
    pool.markInvoked('mcp__srv__c', 2);

    // Adding D exceeds cap 3 -> B is uninvoked, so B is evicted
    pool.activate(['mcp__srv__d'], 2);
    expect(pool.asSet()).toEqual(new Set(['mcp__srv__a', 'mcp__srv__c', 'mcp__srv__d']));

    // Mark D invoked in round 3, then add E -> all are invoked, A is least recently invoked (round 1)
    pool.markInvoked('mcp__srv__d', 3);
    pool.activate(['mcp__srv__e'], 3);
    expect(pool.asSet()).toEqual(new Set(['mcp__srv__c', 'mcp__srv__d', 'mcp__srv__e']));
  });
});
