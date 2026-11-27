import { describe, expect, it } from 'vitest';
import { processTimelineToolIconKind } from '../src/process-timeline-tool-icon.js';
import { liveOutputSummary, persistedOutputSummary, toolTitle } from '../src/tool-copy.js';

describe('processTimelineToolIconKind', () => {
  it('maps canonical tool names', () => {
    expect(processTimelineToolIconKind('web_search')).toBe('search');
    expect(processTimelineToolIconKind('read_file')).toBe('fileSearch');
    expect(processTimelineToolIconKind('create_report')).toBe('fileText');
    expect(processTimelineToolIconKind('skills.read')).toBe('fileText');
    expect(processTimelineToolIconKind('memory_write')).toBe('fileText');
    expect(processTimelineToolIconKind('bash')).toBe('terminal');
    expect(processTimelineToolIconKind('job_output')).toBe('terminal');
    expect(processTimelineToolIconKind('get_current_time')).toBe('clock');
  });

  it('maps MCP public and resource tools to plug', () => {
    expect(processTimelineToolIconKind('mcp__server__tool')).toBe('plug');
    expect(processTimelineToolIconKind('read_mcp_resource')).toBe('plug');
    expect(processTimelineToolIconKind('mcp_add_server')).toBe('plug');
  });

  it('defaults unknown tools to clock', () => {
    expect(processTimelineToolIconKind('custom_tool')).toBe('clock');
  });

  it('formats memory_write, job_output, and skills.read summaries', () => {
    expect(
      liveOutputSummary({
        toolName: 'memory_write',
        memoryWrite: { ok: true, action: 'create', status: 'active' },
      }),
    ).toBe('记忆已保存');
    expect(
      persistedOutputSummary({
        status: 'completed',
        toolName: 'job_output',
      }),
    ).toBe('已读取 job 输出');
    expect(toolTitle('skills.read', { name: 'ai-ppt-html' })).toBe('读取技能：ai-ppt-html');
  });
});
