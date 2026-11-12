import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { BuildDeckResult } from '@harness/ai-ppt';
import { PptExportTool } from '../../../src/tools/ppt-export.tool';

const artifact = {
  artifactId: 'artifact-ppt',
  fileId: 'file-ppt',
  fileName: 'deck.pptx',
  mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  fileKind: 'pptx',
  size: 2048,
  status: 'ready',
  createdAt: '2026-11-12T00:00:00.000Z',
} as const;

const context = {
  userId: 'local-user',
  sessionId: 'session-1',
  runId: 'run-1',
  messageId: 'message-1',
  toolCallId: 'call-1',
};

const plan = {
  version: 1 as const,
  meta: {
    title: '行业研究',
    audience: '管理层',
    language: 'zh-CN',
    aspectRatio: '16:9' as const,
    styleId: 'default',
  },
  slides: [
    {
      id: 's1',
      kind: 'cover' as const,
      claim: '行业进入新阶段',
      layoutId: 'cover' as const,
      content: { title: '行业研究', subtitle: '2026' },
    },
  ],
};

function report(overrides: Record<string, unknown> = {}) {
  return {
    planVersion: 1,
    env: { fonts: ['Noto Sans CJK SC'] },
    checks: [],
    degrade: 'none' as const,
    ...overrides,
  };
}

async function buildResult(
  override: Partial<BuildDeckResult> & { report?: ReturnType<typeof report> } = {},
): Promise<BuildDeckResult> {
  const outDir = await mkdtemp(join(tmpdir(), 'ppt-tool-spec-'));
  const htmlPath = join(outDir, 'deck.html');
  const pptxPath = join(outDir, 'deck.pptx');
  await writeFile(htmlPath, '<html><body>deck</body></html>', 'utf8');
  await writeFile(pptxPath, Buffer.from('pptx'));
  return {
    ok: true,
    paths: { htmlPath, pptxPath, reportPath: join(outDir, 'report.json') },
    html: '<html></html>',
    report: report(),
    pptxBuffer: Buffer.from('pptx'),
    ...override,
  };
}

function imported(fileName: string) {
  return { artifact: { ...artifact, fileName }, file: { ...artifact, fileName } };
}

function makeTool(artifacts: unknown, buildDeck?: unknown, options: Record<string, unknown> = {}) {
  return new PptExportTool(
    artifacts as never,
    {} as never,
    buildDeck as never,
    { unpackScriptPath: '/tmp/unpack.py', ...options } as never,
  );
}

const files = {
  findReadyForSession: vi.fn(),
  readOriginalBytes: vi.fn(),
};

describe('PptExportTool', () => {
  it('exposes a one-call PPTX contract and a long-running budget', () => {
    const tool = makeTool({ importFromSandbox: vi.fn() }, vi.fn());
    const definition = tool.definition();
    expect(tool.executionPolicy.timeoutMs).toBe(180_000);
    expect(definition.parameters).toMatchObject({ required: ['fileName'] });
    expect(definition.description).toContain('deckPlan');
    expect(definition.description).toContain('htmlFileId');
    expect(definition.description).toContain('PPTX');
    expect(definition.description).toContain('preview');
  });

  it('delivers PPTX and an HTML preview in one call for a deck plan', async () => {
    const importFromSandbox = vi
      .fn()
      .mockImplementation(async ({ fileName }: { fileName: string }) => imported(fileName));
    const buildDeck = vi.fn().mockResolvedValue(await buildResult());
    const tool = makeTool({ importFromSandbox }, buildDeck);

    await expect(
      tool.execute({ fileName: 'deck.pptx', deckPlan: plan }, context),
    ).resolves.toMatchObject({
      status: 'succeeded',
      output: {
        status: 'ok',
        artifact: { fileName: 'deck.pptx' },
        preview: { artifact: { fileName: 'deck.html' } },
      },
    });
    expect(buildDeck).toHaveBeenCalledWith(expect.objectContaining({ plan, outDir: expect.any(String) }));
    expect(importFromSandbox).toHaveBeenCalledTimes(2);
    expect(importFromSandbox).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'deck.pptx', runId: 'run-1' }),
    );
    expect(importFromSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'deck.html',
        runId: 'run-1',
        toolCallId: 'call-1:html-preview',
      }),
    );
  });

  it('degrades to HTML when a hard gate fails', async () => {
    const importFromSandbox = vi.fn().mockResolvedValue(imported('deck.html'));
    const buildDeck = vi.fn().mockResolvedValue(
      await buildResult({
        ok: false,
        report: report({
          degrade: 'html_only',
          failureCode: 'validation_failed',
          failureReason: 'cjk coverage low',
        }),
      }),
    );
    const tool = makeTool({ importFromSandbox }, buildDeck);

    const result = await tool.execute({ fileName: 'deck.pptx', deckPlan: plan }, context);
    expect(result).toMatchObject({
      status: 'succeeded',
      output: {
        status: 'degraded',
        report: { failureCode: 'validation_failed' },
      },
    });
    expect(importFromSandbox).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'deck.html' }),
    );
  });

  it('fails without a run id', async () => {
    const tools = new PptExportTool(
      { importFromSandbox: vi.fn() } as never,
      files as never,
      vi.fn() as never,
      { unpackScriptPath: '/tmp/unpack.py' } as never,
    );
    await expect(
      tools.execute({ fileName: 'deck.pptx', deckPlan: plan }, { ...context, runId: undefined }),
    ).resolves.toMatchObject({
      status: 'failed',
      error: { code: 'TOOL_UNAVAILABLE' },
    });
  });

  it('maps storage exceptions to an actionable tool failure', async () => {
    const importFromSandbox = vi.fn().mockRejectedValue(new Error('disk full'));
    const tool = makeTool({ importFromSandbox }, vi.fn().mockResolvedValue(await buildResult()));
    await expect(
      tool.execute({ fileName: 'deck.pptx', deckPlan: plan }, context),
    ).resolves.toMatchObject({
      status: 'failed',
      error: { code: 'ARTIFACT_STORAGE_FAILED', retryable: false },
    });
  });

  it('routes an existing session HTML file through the HTML exporter without a deckPlan', async () => {
    const importFromSandbox = vi.fn().mockResolvedValue(imported('deck.pptx'));
    const exportHtmlFile = vi.fn().mockResolvedValue(await buildResult());
    const htmlExporter = vi.fn().mockResolvedValue(Buffer.from('pptx'));
    files.findReadyForSession.mockResolvedValue({
      id: 'html-1',
      fileKind: 'html',
      fileName: 'deck.html',
    });
    files.readOriginalBytes.mockResolvedValue(
      Buffer.from('<html><div class="slide"></div></html>'),
    );
    const tool = new PptExportTool(
      { importFromSandbox } as never,
      files as never,
      vi.fn() as never,
      { unpackScriptPath: '/does-not-exist/unpack.py', exportHtmlFile, htmlExporter } as never,
    );

    const result = await tool.execute({ fileName: 'deck.pptx', htmlFileId: 'html-1' }, context);

    expect(result).toMatchObject({
      status: 'succeeded',
      output: { status: 'ok', file: { fileName: 'deck.pptx' } },
    });
    expect(files.findReadyForSession).toHaveBeenCalledWith('local-user', 'session-1', 'html-1');
    expect(files.readOriginalBytes).toHaveBeenCalledWith('html-1');
    expect(exportHtmlFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'deck.html',
        unpackScriptPath: '/does-not-exist/unpack.py',
        exportPptx: htmlExporter,
      }),
    );
  });
});
