import { describe, expect, it } from 'vitest';

import {
  mcpInlineActivityLabel,
  mcpToolBusinessSummary,
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

  it('prefers business summary for MCP inline activity label', () => {
    expect(
      mcpInlineActivityLabel({
        toolName: 'mcp__tinyfish__search',
        title: 'tinyfish · search',
        summary: 'search foo, purpose=bar',
      }),
    ).toBe('search foo, purpose=bar');
  });

  it('formats MCP business summaries for search and fetch_content', () => {
    expect(
      mcpToolBusinessSummary('mcp__tinyfish__search', {
        query: '泰永长征 002927',
        purpose: '了解基本面',
      }),
    ).toBe('search 泰永长征 002927, purpose=了解基本面');
    expect(
      mcpToolBusinessSummary('mcp__tinyfish__fetch_content', {
        url: 'https://example.com/long',
        purpose: '获取泰永长征实时行情快照',
      }),
    ).toBe('fetch_content 获取泰永长征实时行情快照');
    expect(
      persistedOutputSummary({
        status: 'completed',
        toolName: 'external_tool',
        publicName: 'mcp__tinyfish__search',
        toolInput: { query: 'foo', purpose: 'bar' },
      }),
    ).toBe('search foo, purpose=bar');
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
