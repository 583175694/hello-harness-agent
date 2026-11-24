import { describe, expect, it } from 'vitest';
import { AGENT_TOOL_NAMES } from '@harness/agent-protocol';
import {
  isParallelSafeTool,
  isRunDedupEligibleTool,
  runWithConcurrencyLimit,
} from '../../../src/agent-runtime/tool-batch-scheduler';

describe('tool-batch-scheduler', () => {
  it('classifies read-only auto_execute tools as parallel-safe and write/approval tools as serial', () => {
    expect(isParallelSafeTool(AGENT_TOOL_NAMES.webSearch, 'auto_execute')).toBe(true);
    expect(isParallelSafeTool(AGENT_TOOL_NAMES.webFetch, 'auto_execute')).toBe(true);
    expect(isParallelSafeTool(AGENT_TOOL_NAMES.readFile, 'auto_execute')).toBe(true);
    expect(isParallelSafeTool(AGENT_TOOL_NAMES.getCurrentTime, 'auto_execute')).toBe(true);
    expect(isParallelSafeTool('mcp__tushareMcp__index_daily', 'auto_execute')).toBe(true);

    // 写/副作用或需审批工具必须保持串行。
    expect(isParallelSafeTool(AGENT_TOOL_NAMES.createFile, 'auto_execute')).toBe(false);
    expect(isParallelSafeTool(AGENT_TOOL_NAMES.bash, 'auto_execute')).toBe(false);
    expect(isParallelSafeTool(AGENT_TOOL_NAMES.pptExport, 'auto_execute')).toBe(false);
    expect(isParallelSafeTool(AGENT_TOOL_NAMES.memoryWrite, 'auto_execute')).toBe(false);
    expect(isParallelSafeTool('mcp__tushareMcp__index_daily', 'require_approval')).toBe(false);
  });

  it('excludes time-sensitive tools from Run-level deduplication', () => {
    expect(isRunDedupEligibleTool(AGENT_TOOL_NAMES.webSearch, 'auto_execute')).toBe(true);
    expect(isRunDedupEligibleTool('mcp__tushareMcp__index_daily', 'auto_execute')).toBe(true);
    expect(isRunDedupEligibleTool(AGENT_TOOL_NAMES.getCurrentTime, 'auto_execute')).toBe(false);
    expect(isRunDedupEligibleTool(AGENT_TOOL_NAMES.jobList, 'auto_execute')).toBe(false);
  });

  it('bounds concurrency and preserves input order', async () => {
    let active = 0;
    let peak = 0;
    const delays = [40, 10, 30, 5, 25, 15];

    const results = await runWithConcurrencyLimit(delays, 3, async (ms, index) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, ms));
      active -= 1;
      return `item-${index}-${ms}`;
    });

    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
    expect(results).toEqual([
      'item-0-40',
      'item-1-10',
      'item-2-30',
      'item-3-5',
      'item-4-25',
      'item-5-15',
    ]);
  });
});
