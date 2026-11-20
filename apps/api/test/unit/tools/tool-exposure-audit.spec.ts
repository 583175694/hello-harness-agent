import { describe, expect, it } from 'vitest';

import { ToolExposureAudit } from '../../../src/tools/tool-exposure/tool-exposure-audit';
import type { McpToolCatalogEntry } from '../../../src/mcp/mcp.types';

function entry(publicName: string, exposure: 'direct' | 'deferred'): McpToolCatalogEntry {
  return {
    publicName,
    serverName: 'srv',
    rawName: publicName.replace('mcp__srv__', ''),
    description: publicName,
    parameters: { type: 'object', properties: {} },
    defaultApproval: 'auto_execute',
    boundGeneration: 1,
    toolCallTimeoutMs: 60_000,
    exposure,
  };
}

describe('ToolExposureAudit', () => {
  it('按 exposure 分区统计直通与延迟名额', () => {
    const audit = new ToolExposureAudit([
      entry('mcp__srv__a', 'direct'),
      entry('mcp__srv__b', 'direct'),
      entry('mcp__srv__c', 'deferred'),
    ]);
    const summary = audit.summary();
    expect(summary.directTotal).toBe(2);
    expect(summary.deferredTotal).toBe(1);
  });

  it('只统计真实发生的 MCP 调用，忽略内置工具', () => {
    const audit = new ToolExposureAudit([
      entry('mcp__srv__a', 'direct'),
      entry('mcp__srv__b', 'direct'),
    ]);
    audit.recordInvocation('mcp__srv__a');
    audit.recordInvocation('web_search');
    const summary = audit.summary();
    expect(summary.directInvoked).toBe(1);
    expect(summary.invokedMcpTotal).toBe(1);
    expect(audit.unusedDirectNames()).toEqual(['mcp__srv__b']);
  });

  it('汇总 tool_search 命中与 fallback', () => {
    const audit = new ToolExposureAudit([entry('mcp__srv__a', 'deferred')]);
    audit.recordSearch({ hits: 3, fallback: false, activated: ['mcp__srv__a'] });
    audit.recordSearch({ hits: 0, fallback: true, activated: [] });
    const summary = audit.summary();
    expect(summary.searchCalls).toBe(2);
    expect(summary.searchHitAverage).toBe(1.5);
    expect(summary.searchFallbackCount).toBe(1);
    expect(summary.activatedTotal).toBe(1);
  });

  it('区分「被激活」与「激活后真的被调用」', () => {
    const audit = new ToolExposureAudit([entry('mcp__srv__a', 'deferred')]);
    audit.recordSearch({ hits: 1, fallback: false, activated: ['mcp__srv__a'] });
    expect(audit.summary().activatedInvoked).toBe(0);
    audit.recordInvocation('mcp__srv__a');
    expect(audit.summary().activatedInvoked).toBe(1);
  });
});
