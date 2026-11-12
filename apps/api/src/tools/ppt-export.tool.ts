import { BadRequestException, HttpException, Inject, Injectable, Optional } from '@nestjs/common';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  AGENT_ERROR_CODES,
  AGENT_PROTOCOL_LIMITS,
  AGENT_TOOL_NAMES,
  pptExportInputSchema,
  pptExportResultSchema,
  type PptExportInput,
  type PptExportResult,
} from '@harness/agent-protocol';
import type { BuildDeckResult, DeckPlan } from '@harness/ai-ppt';
import { ArtifactsService } from '../artifacts/artifacts.service';
import {
  loadDefaultHtmlFileExporter,
  loadDefaultPptxExporter,
  resolveUnpackScriptPath,
  type HtmlToPptxRunner,
} from '../artifacts/html-to-pptx';
import { FilesService } from '../files/files.service';
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from './agent-tool.types';
import { PPT_BUILD_DECK, PPT_EXPORT_OPTIONS } from './ppt-export.tokens';

/** 与 @harness/ai-ppt 的 BuildDeckOptions 保持结构兼容，避免 API 静态引入 ESM 包。 */
export type PptBuildDeck = (input: {
  plan: DeckPlan;
  outDir: string;
  unpackScriptPath: string;
}) => Promise<BuildDeckResult>;

export type PptExportToolOptions = {
  buildDeck?: PptBuildDeck;
  exportHtmlFile?: PptBuildHtmlFile;
  unpackScriptPath?: string;
  htmlExporter?: (htmlPath: string) => Promise<Buffer>;
};

export type PptBuildHtmlFile = HtmlToPptxRunner;

const PPT_EXPORT_TIMEOUT_MS = 180_000;

@Injectable()
export class PptExportTool implements AgentTool<PptExportInput, PptExportResult> {
  readonly name = AGENT_TOOL_NAMES.pptExport;
  readonly inputSchema = pptExportInputSchema;
  readonly inputErrorCode = AGENT_ERROR_CODES.invalidToolArguments;
  readonly executionPolicy = {
    timeoutMs: PPT_EXPORT_TIMEOUT_MS,
    approval: 'auto_execute',
  } as const;

  private readonly buildDeckRunner?: PptBuildDeck;
  private readonly unpackScriptPath: string;
  private readonly htmlExporter?: (htmlPath: string) => Promise<Buffer>;
  private readonly htmlFileExporter?: PptBuildHtmlFile;

  constructor(
    private readonly artifacts: ArtifactsService,
    private readonly files: FilesService,
    @Optional() @Inject(PPT_BUILD_DECK) private readonly injectedBuildDeck?: PptBuildDeck,
    @Optional() @Inject(PPT_EXPORT_OPTIONS) maybeOptions?: PptExportToolOptions,
  ) {
    const options = maybeOptions ?? {};
    this.buildDeckRunner = options.buildDeck ?? this.injectedBuildDeck;
    this.unpackScriptPath = options.unpackScriptPath ?? resolveUnpackScriptPath();
    this.htmlExporter = options.htmlExporter;
    this.htmlFileExporter = options.exportHtmlFile;
  }

  definition() {
    return {
      name: this.name,
      description:
        '生成可编辑演示稿：传 deckPlan 时确定性渲染 16:9 演示稿，直接交付可下载的 PPTX，并附带 HTML 预览。' +
        ' 成功返回 status=ok、PPTX 文件，以及 preview 字段中的 HTML 预览文件。' +
        ' 传 htmlFileId 时复用会话内已有的 16:9 演示 HTML，原样导出为 PPTX；用户也可在 Workbench 对 HTML 点击“下载 PPTX”。' +
        ' deckPlan 版式由 layoutId 固定决定，模型负责内容与选版式；不要直接写 HTML/CSS。' +
        ' content 必填字段：cover{title}；agenda{items[]}；section{number,title}；' +
        'three-col{columns[]}；table{table:{headers[],rows[][]}}；conclusion{points[]}。' +
        ` deckPlan 最多 ${AGENT_PROTOCOL_LIMITS.pptExportMaxSlides} 页；典型中文汇报建议 8–12 页。` +
        ' PPTX 通过字体、溢出、页数、原生表格与中文覆盖率硬门禁后才标记为 ok；' +
        ' 任一硬门禁失败会降级为可打开的 HTML 并返回 report.failureCode，不要对用户声称已生成 PPTX。' +
        ' 调用成功后最终回复只概括内容与验收结果，并提示打开产物；不要在聊天里重复整份 deck plan。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          fileName: {
            type: 'string',
            description: '目标 .pptx 文件名（不含路径）。',
          },
          htmlFileId: {
            type: 'string',
            description:
              '可选的 16:9 演示 HTML 文件 fileId。提供后直接转换为 PPTX，不再需要 deckPlan；适合复用会话内已有的演示 HTML。',
          },
          deckPlan: {
            type: 'object',
            description:
              'deck-plan v1：meta + slides。每页必须选择 cover/agenda/section/three-col/table/conclusion 之一，并提交该版式要求的 content 字段。',
            additionalProperties: true,
          },
        },
        required: ['fileName'],
      },
    };
  }

  isAvailable(): boolean {
    return true;
  }

  async execute(
    input: PptExportInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<PptExportResult>> {
    if (!context.runId) {
      return {
        status: 'failed',
        error: {
          code: AGENT_ERROR_CODES.toolUnavailable,
          detail: 'PPT 导出缺少运行上下文。',
          retryable: false,
        },
      };
    }
    const startedAt = Date.now();
    try {
      const outDir = await mkdtemp(join(tmpdir(), 'harness-ai-ppt-'));
      const built = input.htmlFileId
        ? await this.buildFromHtmlFile(input.htmlFileId, outDir, context)
        : await this.buildFromPlan(input.deckPlan!, outDir);
      const report = {
        ...built.report,
        metrics: {
          ...built.report.metrics,
          pipelineMs: Date.now() - startedAt,
        },
      };

      const pptxReady =
        built.ok && built.report.degrade === 'none' && built.pptxBuffer ? built.pptxBuffer : undefined;
      if (pptxReady) {
        // HTML 与 PPTX 来自同一份渲染结果；预览文件先落盘，再交付主产物。
        const [imported, preview] = await Promise.all([
          this.artifacts.importFromSandbox({
            sessionId: context.sessionId,
            runId: context.runId,
            toolCallId: context.toolCallId,
            fileName: input.fileName,
            data: pptxReady,
          }),
          this.artifacts.importFromSandbox({
            sessionId: context.sessionId,
            runId: context.runId,
            // Artifact 以 runId + toolCallId 幂等，预览必须使用独立标识，
            // 否则第二次导入会直接复用 PPTX 记录，HTML 预览静默丢失。
            toolCallId: `${context.toolCallId}:html-preview`,
            fileName: this.toHtmlFileName(input.fileName),
            data: Buffer.from(built.html, 'utf8'),
          }),
        ]);
        return {
          status: 'succeeded',
          output: pptExportResultSchema.parse({
            status: 'ok',
            artifact: imported.artifact,
            file: imported.file,
            preview: { artifact: preview.artifact, file: preview.file },
            report,
          }),
          logFields: {
            'PPT 页数': input.deckPlan?.slides.length ?? built.report.metrics?.slides ?? 0,
            导出降级: report.degrade ?? 'none',
          },
        };
      }

      // 降级不是“工具失败”：模型和用户仍拿到可打开的 HTML 与具体失败原因。
      const imported = await this.artifacts.importFromSandbox({
        sessionId: context.sessionId,
        runId: context.runId,
        toolCallId: context.toolCallId,
        fileName: this.toHtmlFileName(input.fileName),
        data: Buffer.from(built.html, 'utf8'),
      });
      return {
        status: 'succeeded',
        output: pptExportResultSchema.parse({
          status: 'degraded',
          artifact: imported.artifact,
          file: imported.file,
          report,
        }),
        logFields: {
          'PPT 页数': input.deckPlan?.slides.length ?? built.report.metrics?.slides ?? 0,
          导出降级: report.degrade ?? 'html_only',
          失败码: report.failureCode ?? 'unknown',
        },
      };
    } catch (error) {
      if (context.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        return {
          status: 'cancelled',
          error: {
            code: AGENT_ERROR_CODES.toolCancelled,
            detail: 'PPT 导出已取消。',
            retryable: true,
            cause: error,
          },
        };
      }
      const response = error instanceof HttpException ? error.getResponse() : undefined;
      const code = this.responseField(response, 'code') ?? AGENT_ERROR_CODES.artifactStorageFailed;
      const detail =
        this.responseField(response, 'detail') ??
        `PPT 导出失败：${error instanceof Error ? error.message : String(error)}`;
      return {
        status: 'failed',
        error: { code, detail, retryable: false, cause: error },
      };
    }
  }

  private async buildFromPlan(plan: DeckPlan, outDir: string): Promise<BuildDeckResult> {
    const buildDeck = this.buildDeckRunner ?? (await loadDefaultBuildDeck());
    return buildDeck({
      plan,
      outDir,
      unpackScriptPath: this.unpackScriptPath,
    });
  }

  private toHtmlFileName(fileName: string): string {
    return fileName.replace(/\.pptx$/iu, '.html');
  }

  private async buildFromHtmlFile(
    htmlFileId: string,
    outDir: string,
    context: ToolExecutionContext,
  ): Promise<BuildDeckResult> {
    const file = await this.files.findReadyForSession(
      context.userId,
      context.sessionId,
      htmlFileId,
    );
    if (file.fileKind !== 'html')
      throw new BadRequestException({
        code: AGENT_ERROR_CODES.invalidToolArguments,
        detail: 'htmlFileId 必须指向当前会话中的 HTML 文件。',
      });
    const original = await this.files.readOriginalBytes(file.id);
    const exportHtmlFile = this.htmlFileExporter ?? (await loadDefaultHtmlFileExporter());
    return exportHtmlFile({
      html: original,
      fileName: file.fileName,
      outDir,
      unpackScriptPath: this.unpackScriptPath,
      exportPptx: this.htmlExporter ?? (await loadDefaultPptxExporter()),
    });
  }

  private responseField(response: unknown, field: 'code' | 'detail'): string | undefined {
    if (typeof response !== 'object' || response === null) return undefined;
    const value = (response as Record<string, unknown>)[field];
    return typeof value === 'string' ? value : undefined;
  }
}

async function loadDefaultBuildDeck(): Promise<PptBuildDeck> {
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<typeof import('@harness/ai-ppt')>;
  const pkg = await dynamicImport('@harness/ai-ppt');
  return (input) => pkg.buildDeck(input);
}
