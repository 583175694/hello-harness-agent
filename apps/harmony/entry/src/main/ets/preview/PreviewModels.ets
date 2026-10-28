/** 与 Android ProcessBlock / fixture process[] 对齐 */
export interface ProcessBlockRow {
  kind: string;
  id: string;
  name: string;
  summary: string;
  status: string;
  duration: string;
  statusLabel: string;
  content: string;
  durationMs: number;
  streaming: boolean;
}

export interface ChatLine {
  role: string;
  text: string;
  process: ProcessBlockRow[];
}

export interface PlanStepRow {
  step: string;
  status: string;
}

export interface WorkbenchSourceItem {
  title: string;
  url: string;
  snippet: string;
  passageHeading: string;
  passageBody: string;
}

export interface ArtifactVersionRow {
  label: string;
  selected: boolean;
}

export interface WorkbenchActivityRow {
  id: string;
  title: string;
  kind: string;
  highlighted: boolean;
}

export interface WorkbenchToolExecutionRow {
  id: string;
  toolName: string;
  title: string;
  inputSummary: string;
  outputSummary: string;
  detail: string;
  status: string;
  elapsed: string;
  bashOutput: string;
  linkedSourceIndexes: number[];
}

export interface WorkbenchDeliverableFileRow {
  id: string;
  fileName: string;
  subtitle: string;
  previewMarkdown: string;
}

export interface WorkbenchPreviewState {
  initialView: string;
  /** 0=低 1=中 2=高，对齐 Android/iOS Workbench detent */
  initialSheetIndex: number;
  workbenchCount: number;
  reportMarkdown: string;
  contextJsonPreview: string;
  artifactDiffPreview: string;
  artifactRestorePrompt: string;
  sources: WorkbenchSourceItem[];
  artifactVersions: ArtifactVersionRow[];
  activityTimeline: WorkbenchActivityRow[];
  toolExecutions: WorkbenchToolExecutionRow[];
  deliverableFiles: WorkbenchDeliverableFileRow[];
  bashSnippet: string;
  sourcesRetrievalOnly: boolean;
}

export interface ClarificationPreview {
  question: string;
  options: string[];
  allowFreeText: boolean;
}

export interface SessionDrawerRow {
  id: string;
  title: string;
  time: string;
  active: boolean;
  pinned: boolean;
  running: boolean;
}

export interface SessionDrawerPreviewState {
  draftTitle: string;
  searchPlaceholder: string;
  sessions: SessionDrawerRow[];
}

export interface FollowUpRow {
  id: string;
  content: string;
}

export interface ToolApprovalItemPreview {
  itemId: string;
  toolName: string;
  command: string;
}

export interface ComposerPreviewState {
  composerMode: string;
  composerTextMode: string;
  submitting: boolean;
  placeholder: string;
  disabled: boolean;
  clarification?: ClarificationPreview;
  toolApprovalTitle: string;
  toolApprovalNote: string;
  toolCommands: string[];
  toolApprovalItems: ToolApprovalItemPreview[];
  followUps: FollowUpRow[];
  showPlan: boolean;
  planExplanation: string;
  planSteps: PlanStepRow[];
  planInitialExpanded: boolean;
  modelLabel: string;
  attachmentNames: string[];
  selectedSkills: string[];
}

export function emptyWorkbench(): WorkbenchPreviewState {
  return {
    initialView: 'activity',
    initialSheetIndex: 2,
    workbenchCount: 0,
    reportMarkdown: '',
    contextJsonPreview: '',
    artifactDiffPreview: '',
    artifactRestorePrompt: '',
    sources: [],
    artifactVersions: [],
    activityTimeline: [],
    toolExecutions: [],
    deliverableFiles: [],
    bashSnippet: '',
    sourcesRetrievalOnly: false,
  };
}

function synthesizeToolExecutions(
  timeline: WorkbenchActivityRow[],
  bashSnippet: string,
): WorkbenchToolExecutionRow[] {
  const list: WorkbenchToolExecutionRow[] = [];
  timeline.forEach((ev) => {
    const t = ev.title.toLowerCase();
    let toolName = ev.kind.length > 0 ? ev.kind : 'tool';
    if (t.includes('bash') || ev.kind.includes('bash')) {
      toolName = 'bash';
    } else if (t.includes('web_search') || t.includes('search')) {
      toolName = 'web_search';
    } else if (t.includes('fetch')) {
      toolName = 'web_fetch';
    } else if (t.includes('read')) {
      toolName = 'read_file';
    }
    list.push({
      id: ev.id,
      toolName,
      title: ev.title.split(' ·')[0] ?? ev.title,
      inputSummary: ev.title,
      outputSummary: '',
      detail: '',
      status: 'completed',
      elapsed: '',
      bashOutput: toolName === 'bash' ? bashSnippet : '',
      linkedSourceIndexes: [],
    });
  });
  if (list.length === 0 && bashSnippet.trim().length > 0) {
    list.push({
      id: 'bash-1',
      toolName: 'bash',
      title: 'bash',
      inputSummary: 'shell',
      outputSummary: '',
      detail: '',
      status: 'completed',
      elapsed: '',
      bashOutput: bashSnippet,
      linkedSourceIndexes: [],
    });
  }
  return list;
}

export function parseWorkbench(raw: Record<string, Object> | undefined): WorkbenchPreviewState {
  if (!raw) {
    return emptyWorkbench();
  }
  const sourcesRaw = raw['sources'] as Array<Record<string, string>> | undefined;
  const sources: WorkbenchSourceItem[] = [];
  if (sourcesRaw) {
    sourcesRaw.forEach((s) => {
      sources.push({
        title: `${s['title'] ?? '来源'}`,
        url: `${s['url'] ?? ''}`,
        snippet: `${s['snippet'] ?? ''}`,
        passageHeading: `${s['passageHeading'] ?? ''}`,
        passageBody: `${s['passageBody'] ?? ''}`,
      });
    });
  }
  const versionsRaw = raw['artifactVersions'] as Array<Record<string, Object>> | undefined;
  const artifactVersions: ArtifactVersionRow[] = [];
  if (versionsRaw) {
    versionsRaw.forEach((v) => {
      artifactVersions.push({
        label: `${v['label'] ?? 'version'}`,
        selected: v['selected'] === true,
      });
    });
  }
  const timelineRaw = raw['activityTimeline'] as Array<Record<string, Object>> | undefined;
  const activityTimeline: WorkbenchActivityRow[] = [];
  if (timelineRaw) {
    timelineRaw.forEach((row) => {
      activityTimeline.push({
        id: `${row['id'] ?? ''}`,
        title: `${row['title'] ?? ''}`,
        kind: `${row['kind'] ?? 'tool'}`,
        highlighted: row['highlighted'] === true,
      });
    });
  }
  const bashSnippet = `${raw['bashSnippet'] ?? ''}`;
  const toolRaw = raw['toolExecutions'] as Array<Record<string, Object>> | undefined;
  let toolExecutions: WorkbenchToolExecutionRow[] = [];
  if (toolRaw) {
    toolRaw.forEach((row, index) => {
      const idxRaw = row['linkedSourceIndexes'] as number[] | undefined;
      toolExecutions.push({
        id: `${row['id'] ?? `tool-${index}`}`,
        toolName: `${row['toolName'] ?? 'tool'}`,
        title: `${row['title'] ?? ''}`,
        inputSummary: `${row['inputSummary'] ?? ''}`,
        outputSummary: `${row['outputSummary'] ?? ''}`,
        detail: `${row['detail'] ?? ''}`,
        status: `${row['status'] ?? 'completed'}`,
        elapsed: `${row['elapsed'] ?? ''}`,
        bashOutput: `${row['bashOutput'] ?? ''}`,
        linkedSourceIndexes: idxRaw ?? [],
      });
    });
  }
  if (toolExecutions.length === 0) {
    toolExecutions = synthesizeToolExecutions(activityTimeline, bashSnippet);
  }
  const filesRaw = raw['deliverableFiles'] as Array<Record<string, string>> | undefined;
  let deliverableFiles: WorkbenchDeliverableFileRow[] = [];
  if (filesRaw) {
    filesRaw.forEach((row, index) => {
      deliverableFiles.push({
        id: `${row['id'] ?? `file-${index}`}`,
        fileName: `${row['fileName'] ?? ''}`,
        subtitle: `${row['subtitle'] ?? ''}`,
        previewMarkdown: `${row['previewMarkdown'] ?? ''}`,
      });
    });
  }
  if (deliverableFiles.length === 0) {
    artifactVersions.forEach((ver, index) => {
      deliverableFiles.push({
        id: `ver-${index}`,
        fileName: ver.label.split(' ·')[0] ?? ver.label,
        subtitle: ver.label,
        previewMarkdown: `${raw['artifactDiffPreview'] ?? ''}`,
      });
    });
  }
  const sheetIdx = Number(raw['initialSheetIndex'] ?? 2);
  return {
    initialView: `${raw['initialView'] ?? 'activity'}`,
    initialSheetIndex: Math.min(2, Math.max(0, sheetIdx)),
    workbenchCount: Number(raw['workbenchCount'] ?? 0),
    reportMarkdown: `${raw['reportMarkdown'] ?? ''}`,
    contextJsonPreview: `${raw['contextJsonPreview'] ?? ''}`,
    artifactDiffPreview: `${raw['artifactDiffPreview'] ?? ''}`,
    artifactRestorePrompt: `${raw['artifactRestorePrompt'] ?? ''}`,
    sources,
    artifactVersions,
    activityTimeline,
    toolExecutions,
    deliverableFiles,
    bashSnippet,
    sourcesRetrievalOnly: raw['sourcesRetrievalOnly'] === true,
  };
}

export function parseComposer(raw: Record<string, Object> | undefined): ComposerPreviewState {
  const base: ComposerPreviewState = {
    composerMode: 'default',
    composerTextMode: 'new-run',
    submitting: false,
    placeholder: '描述你想完成的任务…',
    disabled: false,
    toolApprovalTitle: '',
    toolApprovalNote: '',
    toolCommands: [],
    toolApprovalItems: [],
    followUps: [],
    showPlan: false,
    planExplanation: '',
    planSteps: [],
    planInitialExpanded: false,
    modelLabel: '默认模型',
    attachmentNames: [],
    selectedSkills: [],
  };
  if (!raw) {
    return base;
  }
  base.composerMode = `${raw['mode'] ?? 'default'}`;
  const mode = `${raw['composerTextMode'] ?? 'new-run'}`;
  base.composerTextMode = mode;
  base.submitting = raw['submitting'] === true;
  if (mode === 'disabled') {
    base.disabled = true;
    base.placeholder = 'Composer 已禁用（Preview）';
  } else if (mode === 'steer') {
    base.placeholder = '补充方向，将从下一步骤应用……';
  } else if (mode === 'clarification') {
    base.placeholder = '可选：补充说明…';
  }
  const clar = raw['clarification'] as Record<string, Object> | undefined;
  if (clar) {
    const opts = clar['options'] as string[] | undefined;
    base.clarification = {
      question: `${clar['question'] ?? ''}`,
      options: opts ?? [],
      allowFreeText: clar['allowFreeText'] === true,
    };
  }
  const approval = raw['toolApproval'] as Record<string, Object> | undefined;
  if (approval) {
    base.disabled = true;
    base.toolApprovalTitle = `${approval['title'] ?? '工具审批'}`;
    base.toolApprovalNote = `${approval['sandboxNote'] ?? ''}`;
    const items = approval['items'] as Array<Record<string, string>> | undefined;
    if (items) {
      items.forEach((it) => {
        const toolName = `${it['toolName'] ?? 'tool'}`;
        const cmd = `${it['command'] ?? toolName}`;
        const itemId = `${it['itemId'] ?? cmd}`;
        base.toolCommands.push(cmd);
        base.toolApprovalItems.push({ itemId, toolName, command: cmd });
      });
    }
  }
  const followRaw = raw['followUps'] as Array<Record<string, string>> | undefined;
  if (followRaw) {
    followRaw.forEach((row) => {
      base.followUps.push({
        id: `${row['id'] ?? ''}`,
        content: `${row['content'] ?? ''}`,
      });
    });
  }
  base.showPlan = raw['showPlan'] === true;
  base.modelLabel = `${raw['selectedModelLabel'] ?? base.modelLabel}`;
  const attachments = raw['attachmentNames'] as string[] | undefined;
  if (attachments) {
    base.attachmentNames = attachments.slice();
  }
  const skills = raw['selectedSkills'] as string[] | undefined;
  if (skills) {
    base.selectedSkills = skills.slice();
  }
  const plan = raw['plan'] as Record<string, Object> | undefined;
  if (plan) {
    base.planInitialExpanded = plan['initialExpanded'] === true;
    base.planExplanation = `${plan['explanation'] ?? ''}`;
    const steps = plan['steps'] as Array<Record<string, string>> | undefined;
    if (steps) {
      steps.forEach((s) => {
        base.planSteps.push({
          step: `${s['step'] ?? ''}`,
          status: `${s['status'] ?? ''}`,
        });
      });
    }
  }
  return base;
}

function emptyProcessBlock(): ProcessBlockRow {
  return {
    kind: '',
    id: '',
    name: '',
    summary: '',
    status: '',
    duration: '',
    statusLabel: '',
    content: '',
    durationMs: 0,
    streaming: false,
  };
}

export function parseProcessBlocks(processRaw: Array<Record<string, Object>> | undefined): ProcessBlockRow[] {
  const blocks: ProcessBlockRow[] = [];
  if (!processRaw) {
    return blocks;
  }
  processRaw.forEach((block) => {
    const type = `${block['type'] ?? ''}`;
    if (type === 'reasoning') {
      const row = emptyProcessBlock();
      row.kind = 'reasoning';
      row.content = `${block['content'] ?? ''}`;
      row.durationMs = Number(block['durationMs'] ?? 0);
      row.streaming = block['streaming'] === true;
      blocks.push(row);
      return;
    }
    if (type === 'tool_activity') {
      const item = block['item'] as Record<string, Object> | undefined;
      if (!item) {
        return;
      }
      const row = emptyProcessBlock();
      row.kind = 'tool_activity';
      row.id = `${item['id'] ?? ''}`;
      row.name = `${item['name'] ?? 'tool'}`;
      row.summary = `${item['summary'] ?? ''}`;
      row.status = `${item['status'] ?? 'completed'}`;
      row.duration = `${item['duration'] ?? ''}`;
      row.statusLabel = `${item['statusLabel'] ?? ''}`;
      blocks.push(row);
      return;
    }
    if (type === 'text') {
      const row = emptyProcessBlock();
      row.kind = 'text';
      row.content = `${block['content'] ?? ''}`;
      if (row.content.trim().length > 0) {
        blocks.push(row);
      }
    }
  });
  return blocks;
}

export function parseConversation(rows: Array<Record<string, Object>> | undefined): ChatLine[] {
  const out: ChatLine[] = [];
  if (!rows) {
    return out;
  }
  rows.forEach((row) => {
    const kind = `${row['kind'] ?? ''}`;
    if (kind === 'user') {
      out.push({ role: 'user', text: `${row['content'] ?? ''}`, process: [] });
      return;
    }
    if (kind === 'assistant') {
      const processRaw = row['process'] as Array<Record<string, Object>> | undefined;
      const process = parseProcessBlocks(processRaw);
      const blocks = row['blocks'] as Array<Record<string, string>>;
      let text = '';
      if (blocks) {
        blocks.forEach((b) => {
          if (b['type'] === 'text' && b['content']) {
            text += b['content'];
          }
        });
      }
      const pending = row['pendingText'] as string;
      if (pending && pending.length > 0) {
        text = pending;
      }
      if (text.length === 0) {
        text = '（assistant turn）';
      }
      out.push({ role: 'assistant', text: text, process: process });
    }
  });
  return out;
}
