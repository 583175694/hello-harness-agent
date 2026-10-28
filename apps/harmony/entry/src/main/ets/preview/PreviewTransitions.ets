export interface PreviewComposerPatch {
  mode?: string;
  submitting?: boolean;
  composerTextMode?: string;
  showPlan?: boolean;
}

export interface PreviewTransitionBundle {
  afterClarification?: PreviewComposerPatch;
  afterHitlApprove?: PreviewComposerPatch;
  afterHitlReject?: PreviewComposerPatch;
}

export function parsePreviewTransitions(raw: Record<string, Object> | undefined): PreviewTransitionBundle | undefined {
  if (!raw) {
    return undefined;
  }
  return {
    afterClarification: parseComposerPatch(raw['afterClarification'] as Record<string, Object> | undefined),
    afterHitlApprove: parseComposerPatch(raw['afterHitlApprove'] as Record<string, Object> | undefined),
    afterHitlReject: parseComposerPatch(raw['afterHitlReject'] as Record<string, Object> | undefined),
  };
}

function parseComposerPatch(json: Record<string, Object> | undefined): PreviewComposerPatch | undefined {
  if (!json) {
    return undefined;
  }
  const comp = (json['composer'] as Record<string, Object>) ?? json;
  const patch: PreviewComposerPatch = {};
  if (comp['mode'] !== undefined) {
    patch.mode = `${comp['mode']}`;
  }
  if (comp['submitting'] !== undefined) {
    patch.submitting = comp['submitting'] === true;
  }
  if (comp['composerTextMode'] !== undefined) {
    patch.composerTextMode = `${comp['composerTextMode']}`;
  }
  if (comp['showPlan'] !== undefined) {
    patch.showPlan = comp['showPlan'] === true;
  }
  return patch;
}
