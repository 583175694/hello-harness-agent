import { describe, expect, it } from 'vitest';

import {
  persistedCompletedDetail,
  persistedOutputSummary,
  toolRunningDetail,
  toolTitle,
} from './tool-copy';

describe('tool copy', () => {
  it('uses execute_command copy instead of search fallbacks', () => {
    expect(toolTitle('execute_command', { command: 'echo hi' })).toBe('执行命令');
    expect(toolRunningDetail('execute_command')).toBe('正在执行命令');
    expect(persistedCompletedDetail('execute_command')).toBe('命令执行已完成');
    expect(
      persistedOutputSummary({ status: 'completed', toolName: 'execute_command' }),
    ).toBe('命令执行已完成');
  });

  it('does not describe unknown tools as web search', () => {
    expect(toolTitle('unknown_tool', { query: '看起来像搜索' })).toBe('运行工具 unknown_tool');
    expect(toolRunningDetail('unknown_tool')).toBe('正在执行工具');
    expect(persistedCompletedDetail('unknown_tool')).toBe('工具调用已完成');
    expect(
      persistedOutputSummary({
        status: 'completed',
        toolName: 'unknown_tool',
        resultCount: 3,
      }),
    ).toBeUndefined();
  });
});
