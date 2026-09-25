import { describe, expect, it, vi } from 'vitest';

import { FileCreateTool } from '../../../src/tools/file-create.tool';

const result = {
  artifact: {
    artifactId: 'artifact-1',
    fileId: 'file-1',
    fileName: 'data.xlsx',
    mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileKind: 'xlsx',
    size: 1024,
    status: 'ready',
    createdAt: '2026-09-16T00:00:00.000Z',
  },
  file: {
    fileId: 'file-1',
    fileName: 'data.xlsx',
    mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileKind: 'xlsx',
    size: 1024,
    status: 'ready',
    origin: 'agent_generated',
  },
} as const;

describe('FileCreateTool C2-C', () => {
  it('publishes one flat multi-format schema with a 30 second synchronous budget', () => {
    const tool = new FileCreateTool({ create: vi.fn() } as never);
    const definition = tool.definition();
    expect(tool.executionPolicy.timeoutMs).toBe(30_000);
    expect(definition.parameters).toMatchObject({
      required: ['fileName'],
      properties: { content: { type: 'string' }, sheets: { type: 'array' } },
    });
    expect(definition.description).toContain('HTML、PDF、DOCX 和 XLSX');
    expect(definition.description).toContain('Markdown');
  });

  it('forwards workbook rows and cancellation signal through the Artifact chain', async () => {
    const controller = new AbortController();
    const artifacts = { create: vi.fn().mockResolvedValue(result) };
    const tool = new FileCreateTool(artifacts as never);
    const sheets = [{ name: '数据', rows: [['值'], [1]] }];
    await expect(
      tool.execute(
        { fileName: 'data.xlsx', sheets },
        {
          userId: 'local-user',
          sessionId: 'session-1',
          runId: 'run-1',
          messageId: 'message-1',
          toolCallId: 'call-1',
          signal: controller.signal,
        },
      ),
    ).resolves.toMatchObject({ status: 'succeeded', output: result });
    expect(artifacts.create).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'data.xlsx', sheets, signal: controller.signal }),
    );
  });

  it('maps an aborted render to the existing cancelled tool semantics', async () => {
    const controller = new AbortController();
    controller.abort();
    const tool = new FileCreateTool({
      create: vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')),
    } as never);
    await expect(
      tool.execute(
        { fileName: 'report.docx', content: '# report' },
        {
          userId: 'local-user',
          sessionId: 'session-1',
          runId: 'run-1',
          messageId: 'message-1',
          toolCallId: 'call-1',
          signal: controller.signal,
        },
      ),
    ).resolves.toMatchObject({
      status: 'cancelled',
      error: { code: 'TOOL_CANCELLED' },
    });
  });
});
