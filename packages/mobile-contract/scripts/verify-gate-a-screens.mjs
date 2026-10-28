#!/usr/bin/env node
/**
 * Gate A §4.1 屏幕 / 路由静态接线（三端 Preview 壳，非手验签字）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');

let failed = false;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = true;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function read(rel) {
  const p = path.join(repoRoot, rel);
  if (!fs.existsSync(p)) {
    fail(`missing ${rel}`);
    return '';
  }
  return fs.readFileSync(p, 'utf8');
}

/** @type {[string, string, string, RegExp][]} */
const SCREEN_TRIPLES = [
  [
    'S-CHAT',
    'apps/android/app/src/main/kotlin/com/harness/agent/ui/PreviewScreens.kt',
    'apps/ios/Harness/Preview/PreviewChatShellView.swift',
    'apps/harmony/entry/src/main/ets/pages/PreviewChatPage.ets',
    /PreviewChatShell|PreviewChatShellView|PreviewChatPage/,
  ],
  [
    'S-DRAWER',
    'apps/android/app/src/main/kotlin/com/harness/agent/ui/chat/SessionDrawerOverlay.kt',
    'apps/ios/Harness/Preview/SessionDrawerOverlayView.swift',
    'apps/harmony/entry/src/main/ets/preview/PreviewDrawerOverlay.ets',
    /SessionDrawer|PreviewDrawerOverlay/,
  ],
  [
    'S-WB-SHEET',
    'apps/android/app/src/main/kotlin/com/harness/agent/ui/workbench/WorkbenchSheetOverlay.kt',
    'apps/ios/Harness/Preview/WorkbenchSheetView.swift',
    'apps/harmony/entry/src/main/ets/preview/PreviewWorkbenchSheet.ets',
    /WorkbenchSheet/,
  ],
  [
    'S-COMP',
    'apps/android/app/src/main/kotlin/com/harness/agent/ui/chat/ComposerStack.kt',
    'apps/ios/Harness/Preview/ComposerStackView.swift',
    'apps/harmony/entry/src/main/ets/preview/PreviewComposerStack.ets',
    /ComposerStack/,
  ],
  [
    'S-HITL-CL',
    'apps/android/app/src/main/kotlin/com/harness/agent/ui/chat/ComposerStack.kt',
    'apps/ios/Harness/Preview/ComposerStackView.swift',
    'apps/harmony/entry/src/main/ets/preview/PreviewComposerBar.ets',
    /clarification|Clarification/,
  ],
  [
    'S-HITL-AP',
    'apps/android/app/src/main/kotlin/com/harness/agent/ui/chat/ComposerStack.kt',
    'apps/ios/Harness/Preview/ComposerStackView.swift',
    'apps/harmony/entry/src/main/ets/preview/PreviewComposerBar.ets',
    /toolApproval|ToolApproval|批准/,
  ],
  [
    'S-SET',
    'apps/android/app/src/main/kotlin/com/harness/agent/ui/settings/PreviewSettingsScreens.kt',
    'apps/ios/Harness/Preview/PreviewSettingsViews.swift',
    'apps/harmony/entry/src/main/ets/pages/PreviewSettingsPage.ets',
    /PreviewSettings/,
  ],
  [
    'S-SET-MCP',
    'apps/android/app/src/main/kotlin/com/harness/agent/ui/settings/PreviewSettingsScreens.kt',
    'apps/ios/Harness/Preview/PreviewSettingsViews.swift',
    'apps/harmony/entry/src/main/ets/pages/PreviewMcpPage.ets',
    /Mcp|PreviewMcpPage/,
  ],
  [
    'S-SET-MEM',
    'apps/android/app/src/main/kotlin/com/harness/agent/ui/settings/PreviewSettingsScreens.kt',
    'apps/ios/Harness/Preview/PreviewSettingsViews.swift',
    'apps/harmony/entry/src/main/ets/pages/PreviewMemoryPage.ets',
    /Memory|PreviewMemoryPage/,
  ],
  [
    'S-READER',
    'apps/android/app/src/main/kotlin/com/harness/agent/ui/reader/PreviewReaderScreen.kt',
    'apps/ios/Harness/Preview/PreviewSettingsViews.swift',
    'apps/harmony/entry/src/main/ets/pages/PreviewReaderPage.ets',
    /PreviewReader|PreviewReportReader/,
  ],
  [
    'S-WB-ACT',
    'apps/android/app/src/main/kotlin/com/harness/agent/ui/workbench/WorkbenchSheetOverlay.kt',
    'apps/ios/Harness/Preview/WorkbenchSheetView.swift',
    'apps/harmony/entry/src/main/ets/preview/PreviewWorkbenchSheet.ets',
    /activity|bashSnippet|Activity/,
  ],
  [
    'S-WB-SRC',
    'apps/android/app/src/main/kotlin/com/harness/agent/ui/workbench/WorkbenchSheetOverlay.kt',
    'apps/ios/Harness/Preview/WorkbenchSheetView.swift',
    'apps/harmony/entry/src/main/ets/preview/PreviewWorkbenchSheet.ets',
    /关联来源|relatedSources|WorkbenchSourceCard/,
  ],
  [
    'S-WB-RPT',
    'apps/android/app/src/main/kotlin/com/harness/agent/ui/workbench/WorkbenchSheetOverlay.kt',
    'apps/ios/Harness/Preview/WorkbenchSheetView.swift',
    'apps/harmony/entry/src/main/ets/preview/PreviewWorkbenchSheet.ets',
    /WorkbenchFilesPane|onOpenFilePreview|previewMarkdown|deliverableFiles/,
  ],
  [
    'S-WB-ART',
    'apps/android/app/src/main/kotlin/com/harness/agent/ui/workbench/WorkbenchSheetOverlay.kt',
    'apps/ios/Harness/Preview/WorkbenchSheetView.swift',
    'apps/harmony/entry/src/main/ets/preview/PreviewWorkbenchSheet.ets',
    /WorkbenchFilesPane|deliverableFiles|artifact|预览|Download/,
  ],
  [
    'S-WB-DEMO',
    'packages/mobile-contract/fixtures/preview/rich-session-showcase.json',
    'apps/harmony/entry/src/main/ets/preview/PreviewFixtures.ets',
    'apps/android/app/src/main/kotlin/com/harness/agent/preview/MobileContractPreviewLoader.kt',
    /rich-session-showcase|activityTimeline/,
  ],
  [
    'S-PREV',
    'apps/android/app/src/main/kotlin/com/harness/agent/ui/PreviewScreens.kt',
    'apps/ios/Harness/Preview/PreviewDevMenuView.swift',
    'apps/harmony/entry/src/main/ets/pages/PreviewMenuPage.ets',
    /PreviewDevMenu|PreviewMenuPage/,
  ],
  [
    'S-CONN',
    'apps/android/app/src/main/kotlin/com/harness/agent/ui/PreviewScreens.kt',
    'apps/ios/Harness/Preview/PreviewChatShellView.swift',
    'apps/harmony/entry/src/main/ets/preview/ConnectionChrome.ets',
    /ConnectionPill|ServiceBanner|ProblemDetails|connectionState/,
  ],
];

for (const [id, androidRel, iosRel, harmonyRel, re] of SCREEN_TRIPLES) {
  let screenOk = true;
  for (const [rel, platform] of [
    [androidRel, 'Android'],
    [iosRel, 'iOS'],
    [harmonyRel, 'Harmony'],
  ]) {
    const text = read(rel);
    if (!text || !re.test(text)) {
      fail(`${platform} ${rel} must wire ${id}`);
      screenOk = false;
    }
  }
  if (screenOk) {
    ok(`Gate A screen ${id} wired on Android/iOS/Harmony`);
  }
}

const offlineFixture = read('packages/mobile-contract/fixtures/preview/connection-offline-error.json');
if (offlineFixture && !/connectionState|serviceState|offline/.test(offlineFixture)) {
  fail('connection-offline-error.json must describe offline/connection chrome (S-CONN)');
} else if (offlineFixture) {
  ok('S-CONN fixture connection-offline-error.json present');
}

if (failed) {
  process.exit(1);
}
console.log('Gate A §4.1 screen routing static checks passed.');
