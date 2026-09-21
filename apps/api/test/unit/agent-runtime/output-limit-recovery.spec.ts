import { describe, expect, it } from 'vitest';
import { AGENT_TOOL_NAMES } from '@harness/agent-protocol';
import {
  closeTruncatedJsonObject,
  recoverToolCallArguments,
  recoverTruncatedModelRound,
} from '../../../src/agent-runtime/output-limit-recovery';

describe('output-limit recovery', () => {
  it('closes a truncated create_report object and keeps required fields', () => {
    const parsed = closeTruncatedJsonObject(
      '{"title":"走势复盘","summary":"摘要","fileName":"report.md","content":"# 结论\\n\\n短期偏强',
    );
    expect(parsed).toMatchObject({
      title: '走势复盘',
      summary: '摘要',
      fileName: 'report.md',
      content: '# 结论\n\n短期偏强',
    });
  });

  it('salvages truncated create_report arguments but not truncated search queries', () => {
    const report = recoverToolCallArguments(
      AGENT_TOOL_NAMES.createReport,
      '{"title":"走势复盘","summary":"摘要","fileName":"report.md","content":"# 结论\\n\\n短期偏强',
    );
    expect(report?.salvaged).toBe(true);
    expect(JSON.parse(report?.arguments ?? '{}')).toMatchObject({
      title: '走势复盘',
      content: expect.stringContaining('# 结论'),
    });
    expect(
      recoverToolCallArguments(AGENT_TOOL_NAMES.webSearch, '{"query":"未完成'),
    ).toBeNull();
  });

  it('retries when a truncated round has no usable tool call', () => {
    expect(
      recoverTruncatedModelRound({
        calls: [{ name: AGENT_TOOL_NAMES.webSearch, arguments: '{"query":"未完成' }],
        hasText: false,
        finalResponseOnly: false,
      }),
    ).toMatchObject({ kind: 'retry' });
  });

  it('proceeds when truncated tool JSON is still complete', () => {
    expect(
      recoverTruncatedModelRound({
        calls: [{ name: AGENT_TOOL_NAMES.webSearch, arguments: '{"query":"weather"}' }],
        hasText: false,
        finalResponseOnly: false,
      }),
    ).toMatchObject({ kind: 'proceed', anySalvaged: false });
  });
});
