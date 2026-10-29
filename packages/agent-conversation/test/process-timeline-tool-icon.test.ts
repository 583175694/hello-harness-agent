import { describe, expect, it } from 'vitest';
import { processTimelineToolIconKind } from '../src/process-timeline-tool-icon.js';

describe('processTimelineToolIconKind', () => {
  it('maps canonical tool names', () => {
    expect(processTimelineToolIconKind('web_search')).toBe('search');
    expect(processTimelineToolIconKind('read_file')).toBe('fileSearch');
    expect(processTimelineToolIconKind('create_report')).toBe('fileText');
    expect(processTimelineToolIconKind('bash')).toBe('terminal');
    expect(processTimelineToolIconKind('get_current_time')).toBe('clock');
  });

  it('maps MCP public tools to plug', () => {
    expect(processTimelineToolIconKind('mcp__server__tool')).toBe('plug');
  });

  it('defaults unknown tools to clock', () => {
    expect(processTimelineToolIconKind('custom_tool')).toBe('clock');
  });
});
