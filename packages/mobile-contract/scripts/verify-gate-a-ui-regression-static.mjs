#!/usr/bin/env node
/**
 * Gate A UI 回归（19 条）中可在仓库内静态核对的项；不替代 Preview 手验。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const contractRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(contractRoot, '../..');

let failed = false;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = true;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function read(rel) {
  const p = rel.startsWith('fixtures/')
    ? path.join(contractRoot, rel)
    : path.join(repoRoot, rel);
  return fs.readFileSync(p, 'utf8');
}

function mustExist(rel, label) {
  if (!fs.existsSync(path.join(repoRoot, rel))) {
    fail(`missing ${label}: ${rel}`);
    return false;
  }
  return true;
}

// #3 Drawer
for (const rel of [
  'apps/android/app/src/main/kotlin/com/harness/agent/ui/chat/SessionDrawerOverlay.kt',
  'apps/ios/Harness/Preview/SessionDrawerOverlayView.swift',
  'apps/harmony/entry/src/main/ets/preview/PreviewDrawerOverlay.ets',
]) {
  mustExist(rel, 'Session Drawer');
}
for (const [rel, re, label] of [
  [
    'apps/android/app/src/main/kotlin/com/harness/agent/ui/chat/SessionDrawerOverlay.kt',
    /PullToRefreshBox/,
    'Android',
  ],
  [
    'apps/ios/Harness/Preview/SessionDrawerOverlayView.swift',
    /\.refreshable/,
    'iOS',
  ],
  ['apps/harmony/entry/src/main/ets/preview/PreviewDrawerOverlay.ets', /Refresh\s*\(/, 'Harmony'],
]) {
  if (mustExist(rel, 'Drawer pull-to-refresh')) {
    if (!re.test(read(rel))) {
      fail(`${label} Session Drawer missing pull-to-refresh (#3)`);
    }
  }
}
for (const [rel, re, label] of [
  [
    'apps/android/app/src/main/kotlin/com/harness/agent/ui/chat/SessionDrawerOverlay.kt',
    /新对话[\s\S]*onNewConversation|onNewConversation[\s\S]*新对话/,
    'Android',
  ],
  [
    'apps/ios/Harness/Preview/SessionDrawerOverlayView.swift',
    /Text\("新对话"\)[\s\S]*startNewConversation|startNewConversation[\s\S]*Text\("新对话"\)/,
    'iOS',
  ],
  [
    'apps/harmony/entry/src/main/ets/preview/PreviewDrawerOverlay.ets',
    /Text\('新对话'\)[\s\S]*onNewConversation|onNewConversation[\s\S]*Text\('新对话'\)/,
    'Harmony',
  ],
]) {
  if (mustExist(rel, 'Drawer new chat button')) {
    if (!re.test(read(rel))) {
      fail(`${label} Session Drawer must keep top 新对话 action (#3)`);
    }
  }
}
ok('UI regression static: Drawer pattern + pull-to-refresh + 新对话 on three platforms (#3)');

// #8 Reduce Motion
for (const [rel, re] of [
  ['apps/android/app/src/main/kotlin/com/harness/agent/ui/settings/PreviewSettingsScreens.kt', /Reduce Motion/],
  ['apps/ios/Harness/Preview/PreviewSettingsViews.swift', /Reduce Motion/],
  ['apps/harmony/entry/src/main/ets/pages/PreviewSettingsPage.ets', /Reduce Motion/],
]) {
  if (mustExist(rel, 'Settings')) {
    if (!re.test(read(rel))) {
      fail(`${rel} missing Reduce Motion (#8)`);
    }
  }
}
ok('UI regression static: Reduce Motion settings (#8)');

// #12 Replay
for (const rel of [
  'apps/android/app/src/main/kotlin/com/harness/agent/preview/ReplayController.kt',
  'apps/ios/Harness/Preview/ReplayController.swift',
  'apps/harmony/entry/src/main/ets/preview/PreviewReplayController.ets',
]) {
  mustExist(rel, 'ReplayController');
}
const streamFixture = JSON.parse(read('fixtures/preview/streaming-assistant-tail.json'));
if (!streamFixture.replay?.assistantTail) {
  fail('streaming-assistant-tail.json missing replay.assistantTail (#12)');
}
ok('UI regression static: ReplayController + streaming fixture (#12)');

// #13 Process timeline → Workbench（点工具行打开，无 Composer Peek 条）
const processFixture = JSON.parse(read('fixtures/preview/process-timeline-tools.json'));
const processTurn = processFixture.conversation?.find((t) => t.kind === 'assistant');
if (!processTurn?.process?.some((b) => b.type === 'tool_activity')) {
  fail('process-timeline-tools.json must include assistant tool_activity process (#13)');
}
for (const rel of [
  'apps/android/app/src/main/kotlin/com/harness/agent/ui/chat/ProcessTimeline.kt',
  'apps/ios/Harness/Preview/ProcessTimelineView.swift',
  'apps/harmony/entry/src/main/ets/preview/ProcessTimeline.ets',
]) {
  mustExist(rel, 'Process timeline');
}
ok('UI regression static: Process timeline + fixture (#13)');

// #4 Tab 切换不改变 detent（鸿蒙：Replay 父刷新不得 reset detent/tab）
const harmonyWb = read('apps/harmony/entry/src/main/ets/preview/PreviewWorkbenchSheet.ets');
if (!/sessionKey/.test(harmonyWb) || !/lastSessionKey/.test(harmonyWb)) {
  fail('Harmony PreviewWorkbenchSheet must gate syncFromState on sessionKey (#4)');
}
for (const rel of [
  'apps/android/app/src/main/kotlin/com/harness/agent/ui/workbench/WorkbenchSheetOverlay.kt',
  'apps/ios/Harness/Preview/WorkbenchSheetView.swift',
]) {
  mustExist(rel, 'Workbench sheet');
}
ok('UI regression static: Workbench detent/tab stability (#4)');

// #18 long thread header + fixture size
const longThread = JSON.parse(read('fixtures/preview/long-thread-scroll.json'));
if (!Array.isArray(longThread.conversation) || longThread.conversation.length < 40) {
  fail('long-thread-scroll.json conversation < 40 (#18)');
}
ok('UI regression static: long-thread fixture (#18)');

// #19 connection offline
const offline = JSON.parse(read('fixtures/preview/connection-offline-error.json'));
if (!offline.problemDetails?.title) {
  fail('connection-offline-error.json missing problemDetails (#19)');
}
for (const rel of [
  'apps/android/app/src/main/kotlin/com/harness/agent/ui/chat/ConnectionChrome.kt',
  'apps/ios/Harness/Preview/ConnectionChromeView.swift',
  'apps/harmony/entry/src/main/ets/preview/ConnectionChrome.ets',
]) {
  mustExist(rel, 'ConnectionChrome');
}
ok('UI regression static: connection error fixture + chrome (#19)');

// #9 retrieval-only variant
const retrieval = JSON.parse(read('fixtures/preview/workbench-sources-retrieval-only.json'));
if (retrieval.workbench?.sourcesRetrievalOnly !== true) {
  fail('workbench-sources-retrieval-only.json must set sourcesRetrievalOnly (#9)');
}
ok('UI regression static: sources retrieval-only fixture (#9)');

// #17 MCP / Memory routes (Harmony pages + Android/iOS settings navigation)
for (const rel of [
  'apps/harmony/entry/src/main/ets/pages/PreviewMcpPage.ets',
  'apps/harmony/entry/src/main/ets/pages/PreviewMemoryPage.ets',
]) {
  mustExist(rel, 'Harmony Settings subpage');
}
if (!/mcpList_withSeedServer|PreviewMcpListScreen/.test(read('apps/android/app/src/test/kotlin/com/harness/agent/snapshot/GateASettingsSnapshotTest.kt'))) {
  fail('GateASettingsSnapshotTest must snapshot MCP list (#17)');
}
if (!/testMcpListWithSeedServer/.test(read('apps/ios/HarnessTests/GateASnapshotTests.swift'))) {
  fail('GateASnapshotTests must snapshot MCP list (#17)');
}
if (!/memoryHub_defaultEntries/.test(read('apps/android/app/src/test/kotlin/com/harness/agent/snapshot/GateASettingsSnapshotTest.kt'))) {
  fail('GateASettingsSnapshotTest must snapshot Memory hub (#17)');
}
if (!/testMemoryHubDefault/.test(read('apps/ios/HarnessTests/GateASnapshotTests.swift'))) {
  fail('GateASnapshotTests must snapshot Memory hub (#17)');
}
for (const rel of [
  'apps/android/app/src/test/snapshots/images/com.harness.agent.snapshot_GateASettingsSnapshotTest_mcpList_withSeedServer.png',
  'apps/ios/HarnessTests/__Snapshots__/GateASnapshotTests/testMcpListWithSeedServer.1.png',
  'apps/android/app/src/test/snapshots/images/com.harness.agent.snapshot_GateASettingsSnapshotTest_memoryHub_defaultEntries.png',
  'apps/ios/HarnessTests/__Snapshots__/GateASnapshotTests/testMemoryHubDefault.1.png',
]) {
  mustExist(rel, 'Settings subpage snapshot baseline (#17)');
}
ok('UI regression static: MCP/Memory Preview routes + MCP list snapshots (#17)');

// #6 Workbench 与 Composer overlay 互不强制关闭
function assertOverlayIndependent(chatRel, platform) {
  if (!mustExist(chatRel, `${platform} chat`)) {
    return;
  }
  const text = read(chatRel);
  if (/onModelClick[\s\S]{0,240}workbenchOpen\s*=\s*false/.test(text)) {
    fail(`${platform} model sheet must not close Workbench (#6)`);
  }
  if (/onAttachClick[\s\S]{0,240}workbenchOpen\s*=\s*false/.test(text)) {
    fail(`${platform} attach sheet must not close Workbench (#6)`);
  }
}
assertOverlayIndependent('apps/harmony/entry/src/main/ets/pages/PreviewChatPage.ets', 'Harmony');
for (const rel of [
  'apps/android/app/src/main/kotlin/com/harness/agent/ui/chat/ComposerChrome.kt',
  'apps/ios/Harness/Preview/ComposerChromeViews.swift',
]) {
  mustExist(rel, 'Composer overlay host');
}
ok('UI regression static: Composer overlays independent of Workbench (#6)');

// #7 模型/附件/Skill Sheet（双端 Snapshot + 鸿蒙 AppSheet）
const androidChromeTest = read('apps/android/app/src/test/kotlin/com/harness/agent/snapshot/GateAChromeSnapshotTest.kt');
if (!/composerOverlay_modelSheetOpen/.test(androidChromeTest) || !/composerOverlay_attachmentSheetOpen/.test(androidChromeTest)) {
  fail('Android GateAChromeSnapshotTest missing composer overlay cases (#7)');
}
const iosSnap = read('apps/ios/HarnessTests/GateASnapshotTests.swift');
if (!/testComposerModelSheetOpen/.test(iosSnap) || !/testComposerAttachmentSheetOpen/.test(iosSnap)) {
  fail('iOS GateASnapshotTests missing composer overlay cases (#7)');
}
if (!/AppSheet/.test(read('apps/harmony/entry/src/main/ets/pages/PreviewChatPage.ets'))) {
  fail('Harmony PreviewChatPage must use AppSheet for composer overlays (#7)');
}
ok('UI regression static: Composer overlay sheets (#7)');

// #10 / #11 HITL 澄清与工具审批
const clar = JSON.parse(read('fixtures/preview/hitl-clarification.json'));
if (!clar.composer?.clarification?.question) {
  fail('hitl-clarification.json missing composer.clarification (#10)');
}
const approval = JSON.parse(read('fixtures/preview/hitl-tool-approval.json'));
if (!approval.composer?.toolApproval?.title || !approval.composer?.toolApproval?.items?.length) {
  fail('hitl-tool-approval.json missing toolApproval payload (#11)');
}
for (const [rel, re] of [
  ['apps/android/app/src/test/kotlin/com/harness/agent/snapshot/GateAFixtureSnapshotTest.kt', /hitl-clarification/],
  ['apps/ios/HarnessTests/GateAFixtureSnapshotTests.swift', /hitl-clarification/],
  ['apps/harmony/entry/src/main/ets/preview/PreviewComposerBar.ets', /clarification/],
]) {
  if (mustExist(rel, 'HITL clarification')) {
    if (!re.test(read(rel))) {
      fail(`${rel} missing clarification UI (#10)`);
    }
  }
}
for (const [rel, re] of [
  ['apps/android/app/src/test/kotlin/com/harness/agent/snapshot/GateAFixtureSnapshotTest.kt', /hitl-tool-approval/],
  ['apps/ios/HarnessTests/GateAFixtureSnapshotTests.swift', /hitl-tool-approval/],
  ['apps/harmony/entry/src/main/ets/preview/PreviewComposerBar.ets', /toolApprovalTitle/],
]) {
  if (mustExist(rel, 'HITL approval')) {
    if (!re.test(read(rel))) {
      fail(`${rel} missing tool approval UI (#11)`);
    }
  }
}
ok('UI regression static: HITL clarification + tool approval (#10/#11)');

// #14 Passage 半屏
const sourcesFixture = JSON.parse(read('fixtures/preview/workbench-sources.json'));
const hasPassage = sourcesFixture.workbench?.sources?.some((s) => s.passageBody?.length > 0);
if (!hasPassage) {
  fail('workbench-sources.json must include passageBody on a source (#14)');
}
for (const [rel, re] of [
  ['apps/android/app/src/main/kotlin/com/harness/agent/ui/workbench/WorkbenchSheetOverlay.kt', /WorkbenchPassageSheet/],
  ['apps/ios/Harness/Preview/WorkbenchSheetView.swift', /passageCard/],
  ['apps/harmony/entry/src/main/ets/preview/PreviewWorkbenchSheet.ets', /passageOpen/],
]) {
  if (mustExist(rel, 'Passage sheet')) {
    if (!re.test(read(rel))) {
      fail(`${rel} missing Passage half-sheet (#14)`);
    }
  }
}
if (!/workbenchSources_passageHalfSheet/.test(read('apps/android/app/src/test/kotlin/com/harness/agent/snapshot/GateAFixtureSnapshotTest.kt'))) {
  fail('GateAFixtureSnapshotTest must snapshot Passage half-sheet (#14)');
}
if (!/testWorkbenchSourcesPassageHalfSheet/.test(read('apps/ios/HarnessTests/GateAFixtureSnapshotTests.swift'))) {
  fail('GateAFixtureSnapshotTests must snapshot Passage half-sheet (#14)');
}
const androidPassagePng =
  'apps/android/app/src/test/snapshots/images/com.harness.agent.snapshot_GateAFixtureSnapshotTest_workbenchSources_passageHalfSheet.png';
const iosPassagePng =
  'apps/ios/HarnessTests/__Snapshots__/GateAFixtureSnapshotTests/testWorkbenchSourcesPassageHalfSheet.1.png';
if (mustExist(androidPassagePng, 'Android Passage Paparazzi baseline')) {
  ok('Android Paparazzi baseline for Passage half-sheet (#14)');
}
if (mustExist(iosPassagePng, 'iOS Passage snapshot baseline')) {
  ok('iOS snapshot baseline for Passage half-sheet (#14)');
}
ok('UI regression static: Sources Passage half-sheet + dual-end snapshot (#14)');

// #15 Report → Reader
for (const rel of [
  'apps/android/app/src/main/kotlin/com/harness/agent/ui/PreviewScreens.kt',
  'apps/ios/Harness/Preview/PreviewChatShellView.swift',
  'apps/harmony/entry/src/main/ets/pages/PreviewReaderPage.ets',
]) {
  mustExist(rel, 'Reader route');
}
if (!/PreviewReportReader|onOpenReportReader|PreviewReaderPage/.test(
  read('apps/harmony/entry/src/main/ets/pages/PreviewChatPage.ets'),
)) {
  fail('Harmony chat must navigate to PreviewReaderPage (#15)');
}
if (!mustExist('apps/android/app/src/test/kotlin/com/harness/agent/snapshot/GateAReaderSnapshotTest.kt', 'Reader snapshot')) {
  fail('missing GateAReaderSnapshotTest (#15)');
} else {
  const readerSnap = read('apps/android/app/src/test/kotlin/com/harness/agent/snapshot/GateAReaderSnapshotTest.kt');
  if (!/reportReader_workbenchReportMarkdown/.test(readerSnap) || !/artifactReader_diffPreview/.test(readerSnap)) {
    fail('GateAReaderSnapshotTest must cover Report + Artifact readers (#15)');
  }
}
if (
  !/testReportReaderFullScreen/.test(read('apps/ios/HarnessTests/GateAFixtureSnapshotTests.swift')) ||
  !/testArtifactReaderFullScreen/.test(read('apps/ios/HarnessTests/GateAFixtureSnapshotTests.swift'))
) {
  fail('GateAFixtureSnapshotTests must snapshot Report + Artifact readers (#15)');
}
for (const rel of [
  'apps/android/app/src/test/snapshots/images/com.harness.agent.snapshot_GateAReaderSnapshotTest_reportReader_workbenchReportMarkdown_report-reader.png',
  'apps/android/app/src/test/snapshots/images/com.harness.agent.snapshot_GateAReaderSnapshotTest_artifactReader_diffPreview_artifact-reader.png',
  'apps/ios/HarnessTests/__Snapshots__/GateAFixtureSnapshotTests/testReportReaderFullScreen.1.png',
  'apps/ios/HarnessTests/__Snapshots__/GateAFixtureSnapshotTests/testArtifactReaderFullScreen.1.png',
]) {
  mustExist(rel, 'Reader snapshot baseline (#15)');
}
ok('UI regression static: Report Reader navigation + dual-end reader snapshots (#15)');

// #16 Settings 假保存（API URL 编辑器）
for (const [rel, re] of [
  ['apps/android/app/src/main/kotlin/com/harness/agent/ui/settings/PreviewSettingsScreens.kt', /API|apiBaseUrl|api/i],
  ['apps/ios/Harness/Preview/PreviewSettingsViews.swift', /API|apiBaseUrl/i],
  ['apps/harmony/entry/src/main/ets/pages/PreviewSettingsPage.ets', /API URL/],
]) {
  if (mustExist(rel, 'Settings')) {
    if (!re.test(read(rel))) {
      fail(`${rel} missing API URL editor (#16)`);
    }
  }
}
if (!/settingsRoot_default/.test(read('apps/android/app/src/test/kotlin/com/harness/agent/snapshot/GateASettingsSnapshotTest.kt'))) {
  fail('GateASettingsSnapshotTest must snapshot Settings root (#16)');
}
if (!/testSettingsRootDefault/.test(read('apps/ios/HarnessTests/GateASnapshotTests.swift'))) {
  fail('GateASnapshotTests must snapshot Settings root (#16)');
}
for (const rel of [
  'apps/android/app/src/test/snapshots/images/com.harness.agent.snapshot_GateASettingsSnapshotTest_settingsRoot_default.png',
  'apps/ios/HarnessTests/__Snapshots__/GateASnapshotTests/testSettingsRootDefault.1.png',
]) {
  mustExist(rel, 'Settings root snapshot baseline (#16)');
}
ok('UI regression static: Settings local API URL editor + root snapshots (#16)');

// #1 Plan 浮卡 Workbench 打开时收起
for (const [rel, re] of [
  ['apps/harmony/entry/src/main/ets/preview/PlanFloatingCard.ets', /lockCollapsed/],
  ['apps/android/app/src/main/kotlin/com/harness/agent/ui/chat/ComposerChrome.kt', /lockCollapsed/],
  ['apps/ios/Harness/Preview/ComposerChromeViews.swift', /lockCollapsed/],
]) {
  if (mustExist(rel, 'Plan floating card')) {
    if (!re.test(read(rel))) {
      fail(`${rel} missing Plan lockCollapsed when Workbench open (#1)`);
    }
  }
}
ok('UI regression static: Plan card lock when Workbench open (#1)');

// #5 Workbench 全屏蒙层 + ChatTopBar 结构分区（顶栏在内容 Column，overlay 与 AppSheet 同级）
const harmonyChat = read('apps/harmony/entry/src/main/ets/pages/PreviewChatPage.ets');
const harmonyShellOk =
  /Column\(\)[\s\S]*ChatTopBar[\s\S]*Stack\(\)/.test(harmonyChat) ||
  /Stack\(\)[\s\S]*Column\(\)[\s\S]*ChatTopBar/.test(harmonyChat);
if (!harmonyShellOk) {
  fail('Harmony PreviewChatPage must keep ChatTopBar in content Column, overlays full-bleed (#5)');
}
if (!/PreviewWorkbenchSheet[\s\S]*AppSheet/.test(harmonyChat)) {
  fail('Harmony PreviewChatPage must place Workbench overlay beside AppSheet (#5)');
}
const androidPreview = read('apps/android/app/src/main/kotlin/com/harness/agent/ui/PreviewScreens.kt');
if (!/ChatTopBar[\s\S]*Box\(Modifier\.weight\(1f\)/.test(androidPreview)) {
  fail('Android PreviewChatShellLayout must scope chat body below ChatTopBar (#5)');
}
if (!/WorkbenchSheetOverlay[\s\S]*SessionDrawerOverlay/.test(androidPreview)) {
  fail('Android Workbench must be full-bleed overlay beside Drawer (#5)');
}
if (!/DialogProperties[\s\S]*decorFitsSystemWindows = false/.test(
  read('apps/android/app/src/main/kotlin/com/harness/agent/ui/workbench/WorkbenchSheetOverlay.kt'),
)) {
  fail('Android Workbench must use edge-to-edge Dialog like AppSheet (#5)');
}
const iosShell = read('apps/ios/Harness/Preview/PreviewChatShellView.swift');
if (!/ChatTopBarView[\s\S]*ZStack \{/.test(iosShell)) {
  fail('iOS PreviewChatShellView must scope chat body below ChatTopBar (#5)');
}
if (!/WorkbenchSheetView[\s\S]*SessionDrawerOverlayView/.test(iosShell)) {
  fail('iOS Workbench must be root overlay beside Drawer (#5)');
}
if (!/ignoresSafeArea\(\)/.test(read('apps/ios/Harness/Preview/WorkbenchSheetView.swift'))) {
  fail('iOS Workbench scrim must ignore safe area (#5)');
}
if (!/scrimAlpha|detentIndex >= 2/.test(read('apps/harmony/entry/src/main/ets/preview/PreviewWorkbenchSheet.ets'))) {
  fail('Harmony Workbench should darken scrim at highest detent (#5)');
}
ok('UI regression static: Workbench full-bleed scrim + top bar structure (#5)');

// #2 键盘 / Composer 联动（静态：各端壳层接 keyboard/IME；detent 低档露出 Composer 仍须手验）
if (!/imePadding/.test(read('apps/android/app/src/main/kotlin/com/harness/agent/ui/PreviewScreens.kt'))) {
  fail('Android Preview chat shell missing imePadding (#2)');
}
if (!/safeAreaInset\(edge: \.bottom/.test(read('apps/ios/Harness/Preview/PreviewChatShellView.swift'))) {
  fail('iOS Preview chat shell missing bottom safeAreaInset for Composer (#2)');
}
if (!/keyboardAvoidMode/.test(read('apps/harmony/entry/src/main/ets/pages/PreviewChatPage.ets'))) {
  fail('Harmony PreviewChatPage missing keyboardAvoidMode (#2)');
}
const harmonyChatLayout = read('apps/harmony/entry/src/main/ets/pages/PreviewChatPage.ets');
if (
  !/PreviewComposerStack\([\s\S]*PreviewWorkbenchSheet/.test(harmonyChatLayout) &&
  !/PreviewComposerStack[\s\S]*PreviewWorkbenchSheet/.test(harmonyChatLayout)
) {
  fail('Harmony PreviewChatPage must lay out Composer before Workbench overlay (#2)');
}
if (!/WB_DETENT_HEIGHTS[\s\S]*'44%'/.test(read('apps/harmony/entry/src/main/ets/preview/PreviewWorkbenchSheet.ets'))) {
  fail('Harmony Workbench must support low detent to expose Composer (#2)');
}
if (!/0\.44f/.test(read('apps/android/app/src/main/kotlin/com/harness/agent/ui/workbench/WorkbenchSheetOverlay.kt'))) {
  fail('Android Workbench must support 44% low detent (#2)');
}
if (!/0\.44/.test(read('apps/ios/Harness/Preview/WorkbenchSheetView.swift'))) {
  fail('iOS Workbench must support 44% low detent (#2)');
}
for (const [rel, label] of [
  ['apps/android/app/src/test/kotlin/com/harness/agent/snapshot/GateAWorkbenchDetentSnapshotTest.kt', 'Android'],
  ['apps/ios/HarnessTests/GateAWorkbenchDetentSnapshotTests.swift', 'iOS'],
]) {
  if (mustExist(rel, 'Workbench low detent snapshot')) {
    if (!/workbench-sources\.json/.test(read(rel)) || !/initialSheetIndex\s*=\s*0/.test(read(rel))) {
      fail(`${label} GateAWorkbenchDetent snapshot must load workbench-sources with initialSheetIndex 0 (#2)`);
    }
  }
}
const androidDetentPng =
  'apps/android/app/src/test/snapshots/images/com.harness.agent.snapshot_GateAWorkbenchDetentSnapshotTest_workbenchLowDetent_exposesComposer_workbench-low-detent-44pct.png';
if (mustExist(androidDetentPng, 'Android Paparazzi baseline')) {
  ok('Android Paparazzi baseline for 44% detent (#2)');
}
const iosDetentPng =
  'apps/ios/HarnessTests/__Snapshots__/GateAWorkbenchDetentSnapshotTests/testWorkbenchLowDetentExposesComposer.workbench-low-detent-44pct.png';
if (mustExist(iosDetentPng, 'iOS snapshot baseline')) {
  ok('iOS snapshot baseline for 44% detent (#2)');
}
ok('UI regression static: keyboard/IME + low detent wiring + dual-end 44% snapshot (#2 snapshot; 键盘手验仍建议)');


const retrievalFixture = 'workbench-sources-retrieval-only.json';
if (!read('apps/android/app/src/test/kotlin/com/harness/agent/snapshot/GateAFullScreenSnapshotTest.kt').includes(retrievalFixture)) {
  fail('Android GateAFullScreenSnapshotTest must include retrieval-only fixture (#9)');
}
if (!read('apps/ios/HarnessTests/GateAFullScreenSnapshotTests.swift').includes(retrievalFixture)) {
  fail('iOS GateAFullScreenSnapshotTests must include retrieval-only fixture (#9)');
}
ok('UI regression static: retrieval-only in full-screen snapshot lists (#9)');

const androidFixtureSnap = read(
  'apps/android/app/src/test/kotlin/com/harness/agent/snapshot/GateAFixtureSnapshotTest.kt',
);
if (
  !/workbenchReportMarkdown_artifactTab/.test(androidFixtureSnap) ||
  !/initialView = "artifact"/.test(androidFixtureSnap) ||
  !/richSessionShowcase_sheet/.test(androidFixtureSnap)
) {
  fail('GateAFixtureSnapshotTest must snapshot Artifact tab + rich-session-showcase Workbench');
}
const iosFixtureSnap = read('apps/ios/HarnessTests/GateAFixtureSnapshotTests.swift');
if (
  !/testWorkbenchReportMarkdownArtifactTab/.test(iosFixtureSnap) ||
  !/testRichSessionShowcaseWorkbenchSheet/.test(iosFixtureSnap)
) {
  fail('GateAFixtureSnapshotTests must snapshot Artifact tab + rich-session-showcase Workbench');
}
for (const rel of [
  'apps/android/app/src/test/snapshots/images/com.harness.agent.snapshot_GateAFixtureSnapshotTest_workbenchReportMarkdown_artifactTab.png',
  'apps/android/app/src/test/snapshots/images/com.harness.agent.snapshot_GateAFixtureSnapshotTest_richSessionShowcase_sheet.png',
  'apps/ios/HarnessTests/__Snapshots__/GateAFixtureSnapshotTests/testWorkbenchReportMarkdownArtifactTab.1.png',
  'apps/ios/HarnessTests/__Snapshots__/GateAFixtureSnapshotTests/testRichSessionShowcaseWorkbenchSheet.1.png',
]) {
  mustExist(rel, 'Workbench tab snapshot baseline');
}
const reportFixture = JSON.parse(read('fixtures/preview/workbench-report-markdown.json'));
if (!reportFixture.workbench?.artifactRestorePrompt) {
  fail('workbench-report-markdown.json must include artifactRestorePrompt (S-WB-ART)');
}
for (const [rel, re] of [
  ['apps/android/app/src/main/kotlin/com/harness/agent/ui/workbench/WorkbenchSheetOverlay.kt', /WorkbenchRestoreConfirmSheet|恢复版本/],
  ['apps/ios/Harness/Preview/WorkbenchSheetView.swift', /恢复版本|artifactRestorePrompt/],
  ['apps/harmony/entry/src/main/ets/preview/PreviewWorkbenchSheet.ets', /artifactRestorePrompt|确认恢复/],
]) {
  if (mustExist(rel, 'Artifact restore confirm')) {
    if (!re.test(read(rel))) {
      fail(`${rel} missing Artifact restore static confirm (S-WB-ART)`);
    }
  }
}
if (!/workbenchReportMarkdown_artifactRestoreConfirm/.test(androidFixtureSnap)) {
  fail('GateAFixtureSnapshotTest must snapshot Artifact restore confirm (S-WB-ART)');
}
if (!/testWorkbenchReportMarkdownArtifactRestoreConfirm/.test(iosFixtureSnap)) {
  fail('GateAFixtureSnapshotTests must snapshot Artifact restore confirm (S-WB-ART)');
}
for (const rel of [
  'apps/android/app/src/test/snapshots/images/com.harness.agent.snapshot_GateAFixtureSnapshotTest_workbenchReportMarkdown_artifactRestoreConfirm.png',
  'apps/ios/HarnessTests/__Snapshots__/GateAFixtureSnapshotTests/testWorkbenchReportMarkdownArtifactRestoreConfirm.1.png',
]) {
  mustExist(rel, 'Artifact restore confirm snapshot baseline');
}
ok('UI regression static: Workbench Artifact + rich showcase + restore confirm snapshots (S-WB-ART/DEMO)');

if (failed) {
  process.exit(1);
}
console.log('Gate A UI regression static checks passed (#1–#19 shell/fixture/snapshot wiring; #2 44% 双端快照 + 键盘仍建议手验).');
