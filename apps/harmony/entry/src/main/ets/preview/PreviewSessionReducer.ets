import { ChatLine, ComposerPreviewState, PlanStepRow } from './PreviewModels';
import { PreviewChromeState, PreviewSessionState } from './PreviewFixtureLoader';
import { PreviewComposerPatch, PreviewTransitionBundle } from './PreviewTransitions';

export type PreviewUiActionKind =
  | 'sendText'
  | 'stopRun'
  | 'sendFollowUp'
  | 'dismissFollowUp'
  | 'submitClarification'
  | 'cancelRun'
  | 'approveTools'
  | 'rejectTools'
  | 'addSkill'
  | 'addAttachment';

export interface PreviewUiAction {
  kind: PreviewUiActionKind;
  text?: string;
  id?: string;
}

const MAX_SKILLS: number = 6;
const MAX_ATTACHMENTS: number = 6;

export class PreviewSessionReducer {
  static reduce(
    session: PreviewSessionState,
    lines: ChatLine[],
    action: PreviewUiAction,
  ): { session: PreviewSessionState; lines: ChatLine[] } {
    switch (action.kind) {
      case 'sendText':
        return PreviewSessionReducer.sendText(session, lines, action.text ?? '');
      case 'stopRun':
        return PreviewSessionReducer.stopRun(session, lines);
      case 'sendFollowUp':
        return PreviewSessionReducer.sendFollowUp(session, lines, action.id ?? '');
      case 'dismissFollowUp':
        return PreviewSessionReducer.dismissFollowUp(session, lines, action.id ?? '');
      case 'submitClarification':
        return PreviewSessionReducer.submitClarification(session, lines, action.text ?? '');
      case 'cancelRun':
        return PreviewSessionReducer.cancelRun(session, lines);
      case 'approveTools':
        return PreviewSessionReducer.resolveHitl(session, lines, true);
      case 'rejectTools':
        return PreviewSessionReducer.resolveHitl(session, lines, false);
      case 'addSkill':
        return PreviewSessionReducer.addSkill(session, lines, action.text ?? '');
      case 'addAttachment':
        return PreviewSessionReducer.addAttachment(session, lines, action.text ?? '');
      default:
        return { session, lines };
    }
  }

  private static sendText(session: PreviewSessionState, lines: ChatLine[], raw: string):
    { session: PreviewSessionState; lines: ChatLine[] } {
    const text = raw.trim();
    if (text.length === 0) {
      return { session, lines };
    }
    const nextLines = lines.slice();
    nextLines.push({ role: 'user', text, process: [] });
    let composer = PreviewSessionReducer.copyComposer(session.composer);
    if (!composer.submitting) {
      composer.submitting = true;
    }
    composer = PreviewSessionReducer.advancePlan(composer);
    const synced = PreviewSessionReducer.syncPeek(session, composer);
    synced.isLanding = false;
    return { session: synced, lines: nextLines };
  }

  private static stopRun(session: PreviewSessionState, lines: ChatLine[]):
    { session: PreviewSessionState; lines: ChatLine[] } {
    const composer = PreviewSessionReducer.copyComposer(session.composer);
    composer.submitting = false;
    if (composer.composerTextMode === 'disabled') {
      composer.composerTextMode = 'new-run';
      composer.disabled = false;
    }
    const chrome: PreviewChromeState = {
      connectionState: session.chrome.connectionState,
      serviceState: session.chrome.serviceState,
      runSummary: '',
      peekBarTitle: '',
      peekBarSubtitle: '',
    };
    return {
      session: {
        fileName: session.fileName,
        title: session.title,
        isLanding: session.isLanding,
        lines: session.lines,
        chrome,
        problemTitle: session.problemTitle,
        problemDetail: session.problemDetail,
        composer,
        workbench: session.workbench,
        replay: session.replay,
        sessionDrawer: session.sessionDrawer,
        uiHints: session.uiHints,
        previewTransitions: session.previewTransitions,
      },
      lines,
    };
  }

  private static cancelRun(session: PreviewSessionState, lines: ChatLine[]):
    { session: PreviewSessionState; lines: ChatLine[] } {
    const composer = PreviewSessionReducer.copyComposer(session.composer);
    composer.composerMode = 'default';
    composer.clarification = undefined;
    composer.toolApprovalTitle = '';
    composer.toolApprovalNote = '';
    composer.toolApprovalItems = [];
    composer.composerTextMode = 'new-run';
    composer.disabled = false;
    const patched = { ...session, composer };
    return PreviewSessionReducer.stopRun(patched, lines);
  }

  private static sendFollowUp(session: PreviewSessionState, lines: ChatLine[], id: string):
    { session: PreviewSessionState; lines: ChatLine[] } {
    const item = session.composer.followUps.find((f) => f.id === id);
    if (!item) {
      return { session, lines };
    }
    const composer = PreviewSessionReducer.copyComposer(session.composer);
    composer.followUps = composer.followUps.filter((f) => f.id !== id);
    const mid = { ...session, composer };
    return PreviewSessionReducer.sendText(mid, lines, item.content);
  }

  private static dismissFollowUp(session: PreviewSessionState, lines: ChatLine[], id: string):
    { session: PreviewSessionState; lines: ChatLine[] } {
    const composer = PreviewSessionReducer.copyComposer(session.composer);
    composer.followUps = composer.followUps.filter((f) => f.id !== id);
    return { session: { ...session, composer }, lines };
  }

  private static submitClarification(session: PreviewSessionState, lines: ChatLine[], answer: string):
    { session: PreviewSessionState; lines: ChatLine[] } {
    const text = answer.trim();
    if (text.length === 0) {
      return { session, lines };
    }
    const patch = session.previewTransitions?.afterClarification ?? PreviewSessionReducer.defaultAfterClarification();
    return PreviewSessionReducer.appendUserWithComposerPatch(session, lines, text, (composer) => {
      composer.composerMode = 'default';
      composer.clarification = undefined;
      return PreviewSessionReducer.applyPatch(composer, patch);
    });
  }

  private static resolveHitl(session: PreviewSessionState, lines: ChatLine[], approved: boolean):
    { session: PreviewSessionState; lines: ChatLine[] } {
    const patch = approved
      ? (session.previewTransitions?.afterHitlApprove ?? PreviewSessionReducer.defaultAfterHitlApprove())
      : (session.previewTransitions?.afterHitlReject ?? PreviewSessionReducer.defaultAfterHitlReject());
    const msg = approved ? '已批准工具执行（Preview）' : '已拒绝工具执行（Preview）';
    return PreviewSessionReducer.appendUserWithComposerPatch(session, lines, msg, (composer) => {
      composer.composerMode = 'default';
      composer.toolApprovalTitle = '';
      composer.toolApprovalNote = '';
      composer.toolApprovalItems = [];
      return PreviewSessionReducer.applyPatch(composer, patch);
    });
  }

  private static appendUserWithComposerPatch(
    session: PreviewSessionState,
    lines: ChatLine[],
    text: string,
    transform: (composer: ComposerPreviewState) => ComposerPreviewState,
  ): { session: PreviewSessionState; lines: ChatLine[] } {
    const nextLines = lines.slice();
    nextLines.push({ role: 'user', text, process: [] });
    let composer = transform(PreviewSessionReducer.copyComposer(session.composer));
    if (composer.submitting) {
      composer = PreviewSessionReducer.advancePlan(composer);
    }
    const synced = PreviewSessionReducer.syncPeek({ ...session, composer }, composer);
    synced.isLanding = false;
    return { session: synced, lines: nextLines };
  }

  private static addSkill(session: PreviewSessionState, lines: ChatLine[], skill: string):
    { session: PreviewSessionState; lines: ChatLine[] } {
    let normalized = skill.trim().replace(/^\//, '');
    if (normalized.length === 0) {
      return { session, lines };
    }
    const composer = PreviewSessionReducer.copyComposer(session.composer);
    if (composer.selectedSkills.includes(normalized) || composer.selectedSkills.length >= MAX_SKILLS) {
      return { session, lines };
    }
    composer.selectedSkills = composer.selectedSkills.slice();
    composer.selectedSkills.push(normalized);
    return { session: { ...session, composer }, lines };
  }

  private static addAttachment(session: PreviewSessionState, lines: ChatLine[], fileName: string):
    { session: PreviewSessionState; lines: ChatLine[] } {
    const name = fileName.trim();
    if (name.length === 0) {
      return { session, lines };
    }
    const composer = PreviewSessionReducer.copyComposer(session.composer);
    if (composer.attachmentNames.includes(name) || composer.attachmentNames.length >= MAX_ATTACHMENTS) {
      return { session, lines };
    }
    composer.attachmentNames = composer.attachmentNames.slice();
    composer.attachmentNames.push(name);
    return { session: { ...session, composer }, lines };
  }

  private static copyComposer(c: ComposerPreviewState): ComposerPreviewState {
    return {
      composerMode: c.composerMode,
      composerTextMode: c.composerTextMode,
      submitting: c.submitting,
      placeholder: c.placeholder,
      disabled: c.disabled,
      clarification: c.clarification,
      toolApprovalTitle: c.toolApprovalTitle,
      toolApprovalNote: c.toolApprovalNote,
      toolCommands: c.toolCommands.slice(),
      toolApprovalItems: c.toolApprovalItems.slice(),
      followUps: c.followUps.slice(),
      showPlan: c.showPlan,
      planExplanation: c.planExplanation,
      planSteps: c.planSteps.slice(),
      planInitialExpanded: c.planInitialExpanded,
      modelLabel: c.modelLabel,
      attachmentNames: c.attachmentNames.slice(),
      selectedSkills: c.selectedSkills.slice(),
    };
  }

  private static advancePlan(composer: ComposerPreviewState): ComposerPreviewState {
    if (!composer.showPlan || composer.planSteps.length === 0) {
      return composer;
    }
    const steps: PlanStepRow[] = composer.planSteps.slice();
    const activeIdx = steps.findIndex((s) => s.status === 'in_progress');
    if (activeIdx < 0) {
      const pending = steps.findIndex((s) => s.status === 'pending');
      if (pending >= 0) {
        steps[pending] = { step: steps[pending].step, status: 'in_progress' };
      }
    } else {
      steps[activeIdx] = { step: steps[activeIdx].step, status: 'completed' };
      const nextPending = steps.findIndex((s) => s.status === 'pending');
      if (nextPending >= 0) {
        steps[nextPending] = { step: steps[nextPending].step, status: 'in_progress' };
      }
    }
    composer.planSteps = steps;
    return composer;
  }

  private static syncPeek(session: PreviewSessionState, composer: ComposerPreviewState): PreviewSessionState {
    if (composer.showPlan) {
      const chrome: PreviewChromeState = {
        connectionState: session.chrome.connectionState,
        serviceState: session.chrome.serviceState,
        runSummary: session.chrome.runSummary,
        peekBarTitle: '',
        peekBarSubtitle: '',
      };
      return { ...session, composer, chrome, isLanding: false };
    }
    if (!composer.submitting || composer.planSteps.length === 0) {
      return { ...session, composer };
    }
    const steps = composer.planSteps;
    let activeIdx = steps.findIndex((s) => s.status === 'in_progress');
    if (activeIdx < 0) {
      activeIdx = Math.max(steps.map((s, i) => (s.status === 'completed' ? i : -1)).reduce((a, b) => Math.max(a, b), 0), 0);
    }
    const stepNumber = Math.min(activeIdx + 1, steps.length);
    const title = steps[activeIdx]?.step ?? composer.planExplanation;
    const chrome: PreviewChromeState = {
      connectionState: session.chrome.connectionState,
      serviceState: session.chrome.serviceState,
      runSummary: session.chrome.runSummary,
      peekBarTitle: title,
      peekBarSubtitle: `步骤 ${stepNumber} / ${steps.length}`,
    };
    return { ...session, composer, chrome, isLanding: false };
  }

  private static applyPatch(c: ComposerPreviewState, patch: PreviewComposerPatch): ComposerPreviewState {
    if (patch.mode !== undefined) {
      c.composerMode = patch.mode;
    }
    if (patch.submitting !== undefined) {
      c.submitting = patch.submitting;
    }
    if (patch.composerTextMode !== undefined) {
      c.composerTextMode = patch.composerTextMode;
      c.disabled = patch.composerTextMode === 'disabled';
    }
    if (patch.showPlan !== undefined) {
      c.showPlan = patch.showPlan;
    }
    return c;
  }

  private static defaultAfterClarification(): PreviewComposerPatch {
    return { mode: 'default', submitting: true, composerTextMode: 'new-run' };
  }

  private static defaultAfterHitlApprove(): PreviewComposerPatch {
    return { mode: 'default', submitting: true, composerTextMode: 'steer' };
  }

  private static defaultAfterHitlReject(): PreviewComposerPatch {
    return { mode: 'default', submitting: false, composerTextMode: 'new-run' };
  }
}
