import { WorkbenchPreviewState, WorkbenchToolExecutionRow, WorkbenchSourceItem } from '../preview/PreviewModels';
import { RunDetailRow } from './HarmonyCoreTypes';

/** 对齐 mobile-core WorkbenchDetailProjector（ArkTS 薄投影）。 */
export class HarmonyWorkbenchProjector {
  static fromRunDetail(detail: RunDetailRow): WorkbenchPreviewState {
    const executions = detail.executions.map((raw) => HarmonyWorkbenchProjector.parseExecution(raw)).filter(
      (row) => row !== undefined,
    );
    const sources = detail.sources.map((raw) => HarmonyWorkbenchProjector.parseSource(raw)).filter(
      (row) => row !== undefined,
    );
    const reportMarkdown = HarmonyWorkbenchProjector.extractReportMarkdown(detail.blocks);
    const bashSnippet = HarmonyWorkbenchProjector.extractBashSnippet(detail.blocks, executions);
    const timeline = executions.map((exec) => ({
      id: exec.id,
      kind: 'tool',
      title: exec.title,
      highlighted: exec.status !== 'completed',
    }));
    const toolExecutions = executions.map((exec, index) => {
      const linked =
        exec.toolName === 'web_search' || exec.toolName === 'web_fetch'
          ? sources.map((_s, i) => i)
          : [];
      const copy = exec;
      copy.linkedSourceIndexes = linked;
      return copy;
    });
    const count = executions.length + (sources.length > 0 ? 1 : 0);
    let initialView = 'activity';
    if (sources.length > 0 && executions.length === 0) {
      initialView = 'sources';
    } else if (reportMarkdown.length > 0) {
      initialView = 'report';
    }
    const sourcesRetrievalOnly =
      sources.length > 0 &&
      executions.length > 0 &&
      executions.every((e) => e.toolName === 'web_search') &&
      sources.every((s) => (s.passageBody ?? '').length === 0);
    return {
      runId: detail.runId,
      initialView,
      initialSheetIndex: 2,
      workbenchCount: Math.max(count, sources.length > 0 || executions.length > 0 ? 1 : 0),
      reportMarkdown: reportMarkdown,
      contextJsonPreview: '',
      artifactDiffPreview: '',
      artifactRestorePrompt: '',
      sources,
      artifactVersions: [],
      activityTimeline: timeline,
      toolExecutions,
      deliverableFiles: [],
      bashSnippet: bashSnippet,
      sourcesRetrievalOnly,
    };
  }

  static mergeDeliverables(
    incoming: WorkbenchPreviewState,
    previous: WorkbenchPreviewState | undefined,
  ): WorkbenchPreviewState {
    if (previous === undefined) {
      return incoming;
    }
    return {
      ...incoming,
      initialView: previous.initialView,
      initialSheetIndex: previous.initialSheetIndex,
    };
  }

  private static parseExecution(raw: Record<string, Object>): WorkbenchToolExecutionRow | undefined {
    const toolCallId = `${raw['toolCallId'] ?? ''}`;
    if (toolCallId.length === 0) {
      return undefined;
    }
    const toolName = `${raw['toolName'] ?? 'tool'}`;
    const status = `${raw['status'] ?? 'completed'}`;
    const durationMs = Number(raw['durationMs'] ?? 0);
    const input = raw['input'] as Record<string, Object> | undefined;
    const title = HarmonyWorkbenchProjector.toolTitle(toolName, input);
    const inputSummary = HarmonyWorkbenchProjector.toolInputSummary(toolName, input);
    const outputPreview = `${raw['outputPreview'] ?? ''}`;
    const bashOutput =
      toolName === 'bash'
        ? (outputPreview.length > 0 ? outputPreview : `${input?.['command'] ?? ''}`)
        : '';
    return {
      id: toolCallId,
      toolName,
      title,
      inputSummary,
      outputSummary: outputPreview,
      detail: status === 'failed' ? '执行失败' : '',
      status,
      elapsed: HarmonyWorkbenchProjector.formatDuration(durationMs),
      bashOutput,
      linkedSourceIndexes: [],
    };
  }

  private static parseSource(raw: Record<string, Object>): WorkbenchSourceItem | undefined {
    const finalUrl = `${raw['finalUrl'] ?? ''}`;
    if (finalUrl.length > 0) {
      const passages = raw['passages'] as Array<Record<string, Object>> | undefined;
      const first = passages && passages.length > 0 ? passages[0] : undefined;
      const text = `${first?.['text'] ?? '已读取网页，但没有匹配当前问题的原文片段。'}`;
      return {
        title: `${raw['title'] ?? finalUrl}`,
        url: finalUrl,
        snippet: text,
        passageHeading: `${first?.['heading'] ?? ''}`,
        passageBody: text,
      };
    }
    return {
      title: `${raw['title'] ?? raw['url'] ?? '来源'}`,
      url: `${raw['url'] ?? ''}`,
      snippet: `${raw['snippet'] ?? ''}`,
      passageHeading: '',
      passageBody: '',
    };
  }

  private static extractReportMarkdown(blocks: Array<Record<string, Object>>): string {
    const parts: string[] = [];
    for (const obj of blocks) {
      const type = `${obj['type'] ?? ''}`;
      if (type === 'text') {
        const phase = `${obj['phase'] ?? ''}`;
        if (phase === 'final' || phase.length === 0) {
          const content = `${obj['content'] ?? ''}`;
          if (content.length > 0) {
            parts.push(content);
          }
        }
      } else if (type === 'report') {
        const md = `${obj['markdown'] ?? obj['content'] ?? ''}`;
        if (md.length > 0) {
          return md;
        }
      }
    }
    return parts.join('\n\n');
  }

  private static extractBashSnippet(
    blocks: Array<Record<string, Object>>,
    executions: WorkbenchToolExecutionRow[],
  ): string {
    const bashExec = executions.find((e) => e.toolName === 'bash');
    if (bashExec && bashExec.bashOutput.length > 0) {
      return bashExec.bashOutput;
    }
    for (const obj of blocks) {
      if (`${obj['type'] ?? ''}` === 'tool_activity' && `${obj['toolName'] ?? ''}` === 'bash') {
        return `${obj['summary'] ?? ''}`;
      }
    }
    return '';
  }

  private static toolTitle(toolName: string, input: Record<string, Object> | undefined): string {
    if (toolName === 'web_search') {
      return '网页检索';
    }
    if (toolName === 'web_fetch') {
      return `${input?.['title'] ?? input?.['url'] ?? '读取网页'}`;
    }
    if (toolName === 'bash') {
      return '终端';
    }
    if (toolName === 'read_file' || toolName === 'read_file_lines' || toolName === 'search_file') {
      return `${input?.['fileName'] ?? '文件'}`;
    }
    return toolName;
  }

  private static toolInputSummary(toolName: string, input: Record<string, Object> | undefined): string {
    if (!input) {
      return '';
    }
    if (toolName === 'web_search') {
      return `${input['query'] ?? ''}`;
    }
    if (toolName === 'bash') {
      return `${input['command'] ?? ''}`;
    }
    if (toolName === 'web_fetch') {
      return `${input['url'] ?? input['title'] ?? ''}`;
    }
    return `${input['fileName'] ?? input['query'] ?? input['message'] ?? ''}`;
  }

  private static formatDuration(durationMs: number): string {
    if (durationMs <= 0) {
      return '';
    }
    if (durationMs < 1000) {
      return `${durationMs} 毫秒`;
    }
    const tenths = Math.floor((durationMs + 50) / 100);
    return `${Math.floor(tenths / 10)}.${tenths % 10} 秒`;
  }
}
