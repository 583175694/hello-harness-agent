/**
 * Gate A：preview fixture 字段校验（contract 与鸿蒙 rawfile 共用）。
 * @param {(name: string) => object | null} loadJson
 * @param {{ fail: (msg: string) => void, ok: (msg: string) => void }} hooks
 */
export function runPreviewFixtureFieldChecks(loadJson, { fail, ok }) {
  function composerMode(data, mode) {
    const m = data?.composer?.composerTextMode ?? data?.composerTextMode;
    return m === mode;
  }

  function conversationHasProcess(data) {
    const conv = data?.conversation ?? [];
    return conv.some((row) => Array.isArray(row.process) && row.process.length > 0);
  }

  const landing = loadJson('empty-landing.json');
  if (!landing || (landing.conversation?.length ?? 0) !== 0) {
    fail('empty-landing.json must have empty conversation');
  } else if ((landing.sessionDrawer?.sessions?.length ?? 0) < 1) {
    fail('empty-landing.json must include sessionDrawer.sessions (S-DRAWER / Drawer QA)');
  } else {
    ok('empty-landing.json');
  }

  const long = loadJson('long-thread-scroll.json');
  if (!long || (long.conversation?.length ?? 0) < 40) {
    fail('long-thread-scroll.json must have ≥40 conversation rows');
  } else {
    ok('long-thread-scroll.json');
  }

  const stream = loadJson('streaming-assistant-tail.json');
  if (!stream?.replay?.assistantTail) {
    fail('streaming-assistant-tail.json must include replay.assistantTail');
  } else {
    ok('streaming-assistant-tail.json replay');
  }

  const processFix = loadJson('process-timeline-tools.json');
  if (!processFix || !conversationHasProcess(processFix)) {
    fail('process-timeline-tools.json must include assistant process blocks');
  } else {
    ok('process-timeline-tools.json');
  }

  for (const [mode, file] of [
    ['new-run', 'empty-landing.json'],
    ['steer', 'process-timeline-tools.json'],
    ['clarification', 'hitl-clarification.json'],
    ['disabled', 'connection-offline-error.json'],
  ]) {
    const data = loadJson(file);
    if (!data || !composerMode(data, mode)) {
      fail(`${file} must set composer.composerTextMode=${mode}`);
    }
  }
  ok('composer modes (4)');

  const clar = loadJson('hitl-clarification.json');
  if (!clar?.composer?.clarification) {
    fail('hitl-clarification.json must include composer.clarification');
  }

  const approval = loadJson('hitl-tool-approval.json');
  if (!approval?.composer?.toolApproval?.title) {
    fail('hitl-tool-approval.json must include composer.toolApproval');
  }

  const bash = loadJson('workbench-activity-bash.json');
  const bashSnippet = bash?.workbench?.bashSnippet ?? bash?.bashSnippet;
  if (!bashSnippet) {
    fail('workbench-activity-bash.json must include bashSnippet');
  }

  const conn = loadJson('connection-offline-error.json');
  if (!conn || (!conn.problemDetails?.title && conn.chrome?.connectionState !== 'offline')) {
    fail('connection-offline-error.json must expose offline/problem chrome');
  }

  const report = loadJson('workbench-report-markdown.json');
  const wb = report?.workbench ?? {};
  if (!Array.isArray(wb.artifactVersions) || wb.artifactVersions.length < 1) {
    fail('workbench-report-markdown.json missing workbench.artifactVersions');
  }
  if (typeof wb.artifactRestorePrompt !== 'string' || wb.artifactRestorePrompt.trim().length < 8) {
    fail('workbench-report-markdown.json missing workbench.artifactRestorePrompt (S-WB-ART restore)');
  }

  const sources = loadJson('workbench-sources.json');
  const srcList = sources?.workbench?.sources ?? sources?.sources;
  if (!Array.isArray(srcList) || srcList.length < 1) {
    fail('workbench-sources.json must include workbench.sources');
  }

  const retrieval = loadJson('workbench-sources-retrieval-only.json');
  if (retrieval?.workbench?.sourcesRetrievalOnly !== true) {
    fail('workbench-sources-retrieval-only.json must set workbench.sourcesRetrievalOnly');
  } else {
    ok('workbench-sources-retrieval-only.json');
  }
}
