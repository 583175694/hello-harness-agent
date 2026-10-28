#!/usr/bin/env node
/**
 * Gate A 工程不变量（无 mobile-core、十场景 fixture、Preview 无真 SSE 依赖）。
 * 供 CI 与本地：`pnpm --filter @harness/mobile-contract validate:gate-a`
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const contractRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(contractRoot, '../..');

const REQUIRED_FIXTURES = [
  'empty-landing.json',
  'streaming-assistant-tail.json',
  'long-thread-scroll.json',
  'process-timeline-tools.json',
  'hitl-clarification.json',
  'hitl-tool-approval.json',
  'workbench-activity-bash.json',
  'workbench-report-markdown.json',
  'workbench-sources.json',
  'connection-offline-error.json',
];

let failed = false;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = true;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

const previewDir = path.join(contractRoot, 'fixtures/preview');
for (const name of REQUIRED_FIXTURES) {
  const p = path.join(previewDir, name);
  if (!fs.existsSync(p)) {
    fail(`missing fixture ${name}`);
  }
}
ok(`${REQUIRED_FIXTURES.length} required preview fixtures present`);

const androidGradle = path.join(repoRoot, 'apps/android/app/build.gradle.kts');
if (fs.existsSync(androidGradle)) {
  const text = fs.readFileSync(androidGradle, 'utf8');
  if (/mobile-core/i.test(text)) {
    fail('apps/android/app/build.gradle.kts must not depend on mobile-core (Phase A)');
  } else {
    ok('Android app Gradle has no mobile-core dependency');
  }
}

const settingsGradle = path.join(repoRoot, 'apps/android/settings.gradle.kts');
if (fs.existsSync(settingsGradle)) {
  const text = fs.readFileSync(settingsGradle, 'utf8');
  if (/packages[/\\]mobile-core|:mobile-core/i.test(text)) {
    fail('Android settings.gradle.kts must not include mobile-core module (Phase A)');
  } else {
    ok('Android settings has no mobile-core module');
  }
}

const iosPbxproj = path.join(repoRoot, 'apps/ios/Harness.xcodeproj/project.pbxproj');
if (fs.existsSync(iosPbxproj)) {
  const text = fs.readFileSync(iosPbxproj, 'utf8');
  if (/mobile-core|MobileCore/i.test(text)) {
    fail('iOS project must not link mobile-core (Phase A)');
  } else {
    ok('iOS Xcode project has no mobile-core reference');
  }
}

const forbiddenInPreview = [
  { file: 'apps/android/app/src/main/kotlin/com/harness/agent/preview/PreviewAgentSessionPort.kt', patterns: [/EventSource/, /SSE/i, /ktor.*harness/i] },
];
for (const { file, patterns } of forbiddenInPreview) {
  const p = path.join(repoRoot, file);
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf8');
  for (const re of patterns) {
    if (re.test(text)) {
      fail(`${file} matches forbidden Phase A pattern ${re}`);
    }
  }
}
ok('PreviewAgentSessionPort has no SSE/Harness HTTP patterns');

const harmonyPages = path.join(repoRoot, 'apps/harmony/entry/src/main/ets/pages');
const requiredHarmonyPages = [
  'PreviewMenuPage.ets',
  'PreviewChatPage.ets',
  'PreviewSettingsPage.ets',
  'PreviewMcpPage.ets',
  'PreviewMemoryPage.ets',
  'PreviewReaderPage.ets',
];
for (const page of requiredHarmonyPages) {
  if (!fs.existsSync(path.join(harmonyPages, page))) {
    fail(`missing harmony page ${page}`);
  }
}
ok('Harmony Preview pages skeleton present');

const harmonyPort = path.join(repoRoot, 'apps/harmony/entry/src/main/ets/port/AgentSessionPort.ets');
const harmonyPreviewPort = path.join(
  repoRoot,
  'apps/harmony/entry/src/main/ets/preview/PreviewAgentSessionPort.ets',
);
if (!fs.existsSync(harmonyPort)) {
  fail('missing Harmony port/AgentSessionPort.ets (§5 / §7 Phase B 预留)');
} else if (!fs.existsSync(harmonyPreviewPort)) {
  fail('missing Harmony PreviewAgentSessionPort.ets');
} else {
  ok('Harmony AgentSessionPort + PreviewAgentSessionPort present');
}

const harmonyChat = path.join(repoRoot, 'apps/harmony/entry/src/main/ets/pages/PreviewChatPage.ets');
if (fs.existsSync(harmonyChat)) {
  const chatText = fs.readFileSync(harmonyChat, 'utf8');
  if (/PreviewFixtureLoader\.load/.test(chatText)) {
    fail('Harmony PreviewChatPage must load fixtures via PreviewAgentSessionPort, not PreviewFixtureLoader.load');
  }
  if (!/uiHints\.initialDrawerOpen/.test(chatText)) {
    fail('Harmony PreviewChatPage must apply uiHints.initialDrawerOpen to drawerOpen');
  } else {
    ok('Harmony PreviewChatPage wires uiHints.initialDrawerOpen');
  }
}
const harmonyMenu = path.join(repoRoot, 'apps/harmony/entry/src/main/ets/pages/PreviewMenuPage.ets');
if (fs.existsSync(harmonyMenu)) {
  const menuText = fs.readFileSync(harmonyMenu, 'utf8');
  if (/getRawFileContentSync\(\`mobile-contract/.test(menuText)) {
    fail('Harmony PreviewMenuPage must list fixtures via PreviewAgentSessionPort');
  }
  if (!/PreviewSettingsPage/.test(menuText)) {
    fail('Harmony PreviewMenuPage must link to Settings (§S-PREV / S-SET)');
  } else {
    ok('Harmony Dev Menu links to Preview Settings');
  }
}

const androidPreviewScreens = path.join(repoRoot, 'apps/android/app/src/main/kotlin/com/harness/agent/ui/PreviewScreens.kt');
if (fs.existsSync(androidPreviewScreens)) {
  const devMenu = fs.readFileSync(androidPreviewScreens, 'utf8');
  if (!/PreviewDevMenuScreen[\s\S]*onOpenSettings/.test(devMenu) || !/title = "设置"/.test(devMenu)) {
    fail('Android PreviewDevMenuScreen must link to Settings (§S-PREV / S-SET)');
  } else {
    ok('Android Dev Menu links to Preview Settings');
  }
}

const loaderTriple = [
  'apps/android/app/src/main/kotlin/com/harness/agent/preview/MobileContractPreviewLoader.kt',
  'apps/ios/Harness/Preview/MobileContractPreviewLoader.swift',
  'apps/harmony/entry/src/main/ets/preview/PreviewFixtureLoader.ets',
];
for (const rel of loaderTriple) {
  const p = path.join(repoRoot, rel);
  if (!fs.existsSync(p)) {
    fail(`missing preview loader ${rel}`);
    continue;
  }
  const text = fs.readFileSync(p, 'utf8');
  if (!/problemDetails/.test(text)) {
    fail(`${rel} must parse problemDetails (S-CONN / connection-offline-error)`);
  }
  if (!/initialDrawerOpen/.test(text)) {
    fail(`${rel} must parse uiHints.initialDrawerOpen (S-DRAWER / empty-landing)`);
  }
  if (!/running/.test(text)) {
    fail(`${rel} must parse sessionDrawer.sessions[].running (S-DRAWER)`);
  }
}
ok('Preview loaders parse problemDetails + uiHints + sessionDrawer.running on Android/iOS/Harmony');

for (const rel of [
  'apps/android/app/src/main/kotlin/com/harness/agent/ui/chat/SessionDrawerOverlay.kt',
  'apps/ios/Harness/Preview/SessionDrawerOverlayView.swift',
  'apps/harmony/entry/src/main/ets/preview/PreviewDrawerOverlay.ets',
]) {
  const p = path.join(repoRoot, rel);
  if (!fs.existsSync(p)) {
    fail(`missing drawer overlay ${rel}`);
    continue;
  }
  const t = fs.readFileSync(p, 'utf8');
  if (!/running/.test(t)) {
    fail(`${rel} must render session running indicator (S-DRAWER)`);
  }
}
ok('Session Drawer running indicator wired on Android/iOS/Harmony');

const iosDevMenu = path.join(repoRoot, 'apps/ios/Harness/Preview/PreviewDevMenuView.swift');
if (fs.existsSync(iosDevMenu)) {
  const iosMenu = fs.readFileSync(iosDevMenu, 'utf8');
  if (!/PreviewRoute\.settings/.test(iosMenu) || !/设置/.test(iosMenu)) {
    fail('iOS PreviewDevMenuView must link to Settings (§S-PREV / S-SET)');
  } else {
    ok('iOS Dev Menu links to Preview Settings');
  }
}

const harmonyFixturesEts = path.join(repoRoot, 'apps/harmony/entry/src/main/ets/preview/PreviewFixtures.ets');
if (fs.existsSync(harmonyFixturesEts)) {
  const text = fs.readFileSync(harmonyFixturesEts, 'utf8');
  const listed = [...text.matchAll(/'([^']+\.json)'/g)].map((m) => m[1]);
  for (const name of REQUIRED_FIXTURES) {
    if (!listed.includes(name)) {
      fail(`Harmony PREVIEW_FIXTURE_FILES missing ${name}`);
    }
  }
  if (!listed.includes('workbench-sources-retrieval-only.json')) {
    fail('Harmony PREVIEW_FIXTURE_FILES missing optional workbench-sources-retrieval-only.json');
  }
  if (!listed.includes('rich-session-showcase.json')) {
    fail('Harmony PREVIEW_FIXTURE_FILES missing optional rich-session-showcase.json');
  }
  ok('Harmony Dev Menu lists Gate A fixtures (+ retrieval-only variant)');
}

const harmonyModels = path.join(repoRoot, 'apps/harmony/entry/src/main/ets/preview/PreviewModels.ets');
if (fs.existsSync(harmonyModels)) {
  const text = fs.readFileSync(harmonyModels, 'utf8');
  if (!/initialSheetIndex/.test(text)) {
    fail('Harmony WorkbenchPreviewState must parse initialSheetIndex (detent parity)');
  } else {
    ok('Harmony workbench parses initialSheetIndex');
  }
}

const harmonyWorkbenchSheet = path.join(
  repoRoot,
  'apps/harmony/entry/src/main/ets/preview/PreviewWorkbenchSheet.ets',
);
if (fs.existsSync(harmonyWorkbenchSheet)) {
  const text = fs.readFileSync(harmonyWorkbenchSheet, 'utf8');
  if (!/sessionKey/.test(text) || !/lastSessionKey/.test(text)) {
    fail('Harmony PreviewWorkbenchSheet must gate syncFromState on sessionKey (UI regression #4)');
  } else {
    ok('Harmony Workbench detent/tab stable across Replay updates');
  }
}

if (fs.existsSync(harmonyModels)) {
  const text = fs.readFileSync(harmonyModels, 'utf8');
  const harmonyProcessTimeline = path.join(
    repoRoot,
    'apps/harmony/entry/src/main/ets/preview/ProcessTimeline.ets',
  );
  const parsesProcess =
    /parseProcessBlocks/.test(text) || /parseProcessLines/.test(text);
  if (!/statusLabel/.test(text) || !parsesProcess) {
    fail('Harmony PreviewModels must parse process tool_activity statusLabel/duration (A4 parity)');
  } else if (!fs.existsSync(harmonyProcessTimeline)) {
    fail('Harmony ProcessTimeline.ets must render structured process blocks (A4 parity)');
  } else {
    ok('Harmony process timeline parses tool/reasoning labels');
  }
}

const harmonyCoreUi = path.join(repoRoot, 'apps/harmony/entry/src/main/ets/coreui');
const HARMONY_PRIMITIVES_16_2 = [
  'AppScaffold.ets',
  'AppTopBar.ets',
  'AppText.ets',
  'AppButton.ets',
  'AppIcon.ets',
  'AppTextField.ets',
  'AppSheet.ets',
  'ListRow.ets',
  'HarnessBadge.ets',
  'Spinner.ets',
  'HarnessDivider.ets',
  'HarnessColors.ets',
  'PreviewMarkdownText.ets',
];
for (const primitive of HARMONY_PRIMITIVES_16_2) {
  if (!fs.existsSync(path.join(harmonyCoreUi, primitive))) {
    fail(`missing harmony core-ui primitive ${primitive}`);
  }
}
if (fs.existsSync(harmonyCoreUi)) {
  ok(`Harmony core-ui §16.2 primitives present (${HARMONY_PRIMITIVES_16_2.length} files)`);
}

const tokensPath = path.join(contractRoot, 'design-tokens.json');
const harmonyColorsPath = path.join(repoRoot, 'apps/harmony/entry/src/main/ets/coreui/HarnessColors.ets');
if (fs.existsSync(tokensPath) && fs.existsSync(harmonyColorsPath)) {
  const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
  const colorsEts = fs.readFileSync(harmonyColorsPath, 'utf8');
  const norm = (hex) => hex.replace(/^#/, '').toLowerCase();
  for (const mode of ['light', 'dark']) {
    const suffix = mode === 'light' ? '' : 'Dark';
    for (const key of ['canvas', 'link', 'userBubble', 'primary']) {
      const expected = tokens.colors?.[mode]?.[key];
      if (!expected) continue;
      const field = `${key}${suffix}`;
      const re = new RegExp(`${field}:\\s*string\\s*=\\s*'#([^']+)'`, 'i');
      const m = colorsEts.match(re);
      if (!m || norm(m[1]) !== norm(expected)) {
        fail(`Harmony HarnessColors.${field} must match design-tokens.json ${mode} (${expected})`);
      }
    }
  }
  ok('Harmony HarnessColors matches mobile-contract light + dark tokens (canvas/link/userBubble/primary)');
}

const harmonyConversation = path.join(
  repoRoot,
  'apps/harmony/entry/src/main/ets/preview/ConversationPatterns.ets',
);
if (fs.existsSync(harmonyConversation)) {
  const text = fs.readFileSync(harmonyConversation, 'utf8');
  for (const symbol of ['UserMessageBubble', 'AssistantTurnContent', 'ConversationTurnRow']) {
    if (!text.includes(symbol)) {
      fail(`Harmony ConversationPatterns missing ${symbol}`);
    }
  }
  ok('Harmony ConversationPatterns present');
}

const androidConversation = path.join(
  repoRoot,
  'apps/android/app/src/main/kotlin/com/harness/agent/ui/chat/ConversationPatterns.kt',
);
const iosConversation = path.join(repoRoot, 'apps/ios/Harness/Preview/ConversationPatternsView.swift');
if (!fs.existsSync(androidConversation)) {
  fail('missing Android ConversationPatterns.kt');
} else {
  ok('Android ConversationPatterns present');
}
if (!fs.existsSync(iosConversation)) {
  fail('missing iOS ConversationPatternsView.swift');
} else {
  ok('iOS ConversationPatterns present');
}

for (const rel of [
  'apps/harmony/entry/src/main/ets/preview/WorkbenchSegmentedTabs.ets',
  'apps/harmony/entry/src/main/ets/preview/PlanFloatingCard.ets',
]) {
  if (!fs.existsSync(path.join(repoRoot, rel))) {
    fail(`missing Harmony pattern ${rel}`);
  }
}
ok('Harmony WorkbenchSegmentedTabs + PlanFloatingCard present');

const androidAssetsPreview = path.join(
  repoRoot,
  'apps/android/app/src/main/assets/mobile-contract/fixtures/preview',
);
if (fs.existsSync(androidAssetsPreview)) {
  const assetNames = new Set(
    fs.readdirSync(androidAssetsPreview).filter((f) => f.endsWith('.json')),
  );
  for (const name of REQUIRED_FIXTURES) {
    if (!assetNames.has(name)) {
      fail(`Android assets missing ${name} (run apps/android/scripts/sync-mobile-contract.sh)`);
    }
  }
  if (!assetNames.has('workbench-sources-retrieval-only.json')) {
    fail('Android assets missing workbench-sources-retrieval-only.json');
  }
  ok(`Android assets preview fixtures present (${assetNames.size} json, ten-scene + retrieval-only)`);
}

const harmonyChatTopBar = path.join(repoRoot, 'apps/harmony/entry/src/main/ets/preview/ChatTopBar.ets');
if (!fs.existsSync(harmonyChatTopBar)) {
  fail('missing Harmony ChatTopBar.ets');
} else {
  ok('Harmony ChatTopBar pattern present');
}

const harmonyComposerStack = path.join(
  repoRoot,
  'apps/harmony/entry/src/main/ets/preview/PreviewComposerStack.ets',
);
if (!fs.existsSync(harmonyComposerStack)) {
  fail('missing Harmony PreviewComposerStack.ets (ComposerStack pattern)');
} else {
  ok('Harmony PreviewComposerStack pattern present');
}

const harmonyConnectionChrome = path.join(
  repoRoot,
  'apps/harmony/entry/src/main/ets/preview/ConnectionChrome.ets',
);
if (fs.existsSync(harmonyConnectionChrome)) {
  const text = fs.readFileSync(harmonyConnectionChrome, 'utf8');
  for (const symbol of ['ConnectionPill', 'ServiceBanner', 'ProblemDetailsCard']) {
    if (!text.includes(symbol)) {
      fail(`Harmony ConnectionChrome missing ${symbol}`);
    }
  }
  ok('Harmony ConnectionChrome pattern components present');
}

const harmonyComposer = path.join(repoRoot, 'apps/harmony/entry/src/main/ets/preview/PreviewComposerBar.ets');
if (fs.existsSync(harmonyComposer)) {
  const text = fs.readFileSync(harmonyComposer, 'utf8');
  if (!/TextArea/.test(text)) {
    fail('Harmony PreviewComposerBar must include TextArea input row (Composer stack parity)');
  } else {
    ok('Harmony Composer includes TextArea input row');
  }
}

const harmonyAppButton = path.join(repoRoot, 'apps/harmony/entry/src/main/ets/coreui/AppButton.ets');
if (fs.existsSync(harmonyAppButton)) {
  const text = fs.readFileSync(harmonyAppButton, 'utf8');
  if (!/minHeight:\s*48/.test(text)) {
    fail('Harmony AppButton must meet min 48vp hit target (§4 无障碍与触控)');
  } else {
    ok('Harmony AppButton min hit target 48vp');
  }
}

const harmonyChatPageKb = path.join(repoRoot, 'apps/harmony/entry/src/main/ets/pages/PreviewChatPage.ets');
if (fs.existsSync(harmonyChatPageKb)) {
  const text = fs.readFileSync(harmonyChatPageKb, 'utf8');
  if (!/keyboardAvoidMode/.test(text)) {
    fail('Harmony PreviewChatPage should use keyboardAvoidMode for Composer (#4.3 键盘联动)');
  } else {
    ok('Harmony PreviewChatPage keyboard avoid mode');
  }
}

const androidSettings = path.join(repoRoot, 'apps/android/app/src/main/kotlin/com/harness/agent/ui/settings/PreviewSettingsScreens.kt');
if (fs.existsSync(androidSettings)) {
  const text = fs.readFileSync(androidSettings, 'utf8');
  if (!/Reduce Motion/.test(text)) {
    fail('Android Preview settings missing Reduce Motion toggle (§4.3)');
  } else {
    ok('Android Preview settings include Reduce Motion');
  }
}

const iosSettings = path.join(repoRoot, 'apps/ios/Harness/Preview/PreviewSettingsViews.swift');
if (fs.existsSync(iosSettings)) {
  const text = fs.readFileSync(iosSettings, 'utf8');
  if (!/Reduce Motion/.test(text)) {
    fail('iOS Preview settings missing Reduce Motion toggle (§4.3)');
  } else {
    ok('iOS Preview settings include Reduce Motion');
  }
}

const harmonySettings = path.join(repoRoot, 'apps/harmony/entry/src/main/ets/pages/PreviewSettingsPage.ets');
if (fs.existsSync(harmonySettings)) {
  const text = fs.readFileSync(harmonySettings, 'utf8');
  if (!/Reduce Motion/.test(text)) {
    fail('Harmony Preview settings missing Reduce Motion toggle (§4.3)');
  } else {
    ok('Harmony Preview settings include Reduce Motion');
  }
}

const harmonyChatPage = path.join(repoRoot, 'apps/harmony/entry/src/main/ets/pages/PreviewChatPage.ets');
if (fs.existsSync(harmonyChatPage)) {
  const text = fs.readFileSync(harmonyChatPage, 'utf8');
  if (!/reduceMotion:\s*this\.reduceMotion/.test(text)) {
    fail('Harmony PreviewChatPage must pass reduceMotion to Drawer/Workbench (§4.3 regression #8)');
  } else {
    ok('Harmony PreviewChatPage wires reduceMotion to overlays');
  }
  if (!/fontSize:\s*this\.contentFontSize/.test(text)) {
    fail('Harmony PreviewChatPage must pass contentFontSize to conversation rows (§4.3 字号阶梯)');
  } else {
    ok('Harmony PreviewChatPage wires contentFontSize to conversation');
  }
  if (!/useDark:\s*this\.themeDark/.test(text)) {
    fail('Harmony PreviewChatPage must pass themeDark to conversation rows (§4.3 Light/Dark)');
  } else {
    ok('Harmony PreviewChatPage wires themeDark to conversation');
  }
  if (!/PreviewDrawerOverlay\([\s\S]*useDark:\s*this\.themeDark/.test(text)) {
    fail('Harmony PreviewChatPage must pass themeDark to Drawer (§4.3 Light/Dark)');
  } else {
    ok('Harmony PreviewChatPage wires themeDark to Drawer');
  }
  if (!/ServiceBanner\([\s\S]*useDark:\s*this\.themeDark/.test(text)) {
    fail('Harmony PreviewChatPage must pass themeDark to ServiceBanner (§4.3 / S-CONN)');
  } else {
    ok('Harmony PreviewChatPage wires themeDark to connection chrome');
  }
}

const harmonyDrawer = path.join(repoRoot, 'apps/harmony/entry/src/main/ets/preview/PreviewDrawerOverlay.ets');
if (fs.existsSync(harmonyDrawer)) {
  const drawerText = fs.readFileSync(harmonyDrawer, 'utf8');
  if (!/@Prop useDark/.test(drawerText) || !/HarnessColors\.surface\(this\.useDark\)/.test(drawerText)) {
    fail('Harmony PreviewDrawerOverlay must support useDark surface colors (§4.3)');
  } else {
    ok('Harmony PreviewDrawerOverlay supports dark theme');
  }
  if (!/AppTextField/.test(drawerText) || !/searchQuery/.test(drawerText)) {
    fail('Harmony PreviewDrawerOverlay must include session search field (S-DRAWER)');
  } else {
    ok('Harmony PreviewDrawerOverlay includes search UI (S-DRAWER)');
  }
  if (!/重命名/.test(drawerText) || !/删除会话/.test(drawerText) || !/menuTarget/.test(drawerText)) {
    fail('Harmony PreviewDrawerOverlay must include long-press session menu rename/delete (S-DRAWER)');
  } else {
    ok('Harmony PreviewDrawerOverlay includes session context menu (S-DRAWER)');
  }
  if (!/onSelectSession/.test(drawerText)) {
    fail('Harmony PreviewDrawerOverlay must support session row tap (S-DRAWER #3)');
  } else {
    ok('Harmony PreviewDrawerOverlay wires session row selection');
  }
}

const harmonyAppTextField = path.join(repoRoot, 'apps/harmony/entry/src/main/ets/coreui/AppTextField.ets');
if (fs.existsSync(harmonyAppTextField)) {
  const tf = fs.readFileSync(harmonyAppTextField, 'utf8');
  if (!/@Prop useDark/.test(tf) || !/mutedText\(this\.useDark\)/.test(tf)) {
    fail('Harmony AppTextField must support useDark (§16.2 Settings/MCP forms)');
  } else {
    ok('Harmony AppTextField supports dark theme');
  }
}

// A6 Workbench Tab（activity + artifact，对齐 RN/Web；来源/报告并入实时跟随；Gate A 不含 Context Tab）
const wbTabTriple = [
  'apps/android/app/src/main/kotlin/com/harness/agent/ui/workbench/WorkbenchSheetOverlay.kt',
  'apps/ios/Harness/Preview/WorkbenchSheetView.swift',
  'apps/harmony/entry/src/main/ets/preview/PreviewWorkbenchSheet.ets',
];
for (const rel of wbTabTriple) {
  const p = path.join(repoRoot, rel);
  if (!fs.existsSync(p)) {
    fail(`missing ${rel}`);
    continue;
  }
  const text = fs.readFileSync(p, 'utf8');
  if (!/artifact/.test(text) || !/activity/.test(text)) {
    fail(`${rel} must expose Workbench activity + artifact tabs`);
  }
  if (/["']sources["']/.test(text) && /WorkbenchTabLabels|"sources"\s*->|segment.*sources/.test(text)) {
    fail(`${rel} must not expose separate Sources tab (merged into activity)`);
  }
  if (/["']report["']/.test(text) && /WorkbenchTabLabels|"report"\s*->|segment.*report/.test(text)) {
    fail(`${rel} must not expose separate Report tab`);
  }
  if (/["']context["']/.test(text) && /Context Tab|workbenchTabLabel.*context|"context" ->/.test(text)) {
    fail(`${rel} must not expose Context tab in Gate A Preview`);
  }
}
ok('Workbench two-tab wiring (activity + artifact) on Android/iOS/Harmony');

const reportFixture = path.join(contractRoot, 'fixtures/preview/workbench-report-markdown.json');
if (fs.existsSync(reportFixture)) {
  const report = JSON.parse(fs.readFileSync(reportFixture, 'utf8'));
  const wb = report?.workbench ?? report?.activeSession?.workbench ?? report;
  const versions = wb?.artifactVersions ?? report?.artifactVersions;
  if (!Array.isArray(versions) || versions.length < 1) {
    fail('workbench-report-markdown.json must include artifactVersions for Artifact Tab UI');
  }
  ok('workbench-report-markdown fixture covers Artifact tab');
}

const richShowcase = path.join(contractRoot, 'fixtures/preview/rich-session-showcase.json');
if (fs.existsSync(richShowcase)) {
  const rich = JSON.parse(fs.readFileSync(richShowcase, 'utf8'));
  const tl = rich?.workbench?.activityTimeline ?? [];
  const src = rich?.workbench?.sources ?? [];
  if (tl.length < 8 || src.length < 3 || (rich.conversation?.length ?? 0) < 2) {
    fail('rich-session-showcase.json must include rich conversation + workbench mock');
  } else {
    ok('rich-session-showcase.json demo fixture');
  }
}

const stockReview = path.join(contractRoot, 'fixtures/preview/stock-market-review.json');
if (fs.existsSync(stockReview)) {
  const stock = JSON.parse(fs.readFileSync(stockReview, 'utf8'));
  const tools = stock?.workbench?.toolExecutions ?? [];
  const assistantTurn = (stock?.conversation ?? []).find((row) => row?.kind === 'assistant');
  const process = assistantTurn?.process ?? [];
  if (tools.length < 2 || process.length < 2) {
    fail('stock-market-review.json must include process timeline + toolExecutions for demo');
  } else {
    ok('stock-market-review.json demo fixture');
  }
  const androidFullPath = path.join(
    repoRoot,
    'apps/android/app/src/test/kotlin/com/harness/agent/snapshot/GateAFullScreenSnapshotTest.kt',
  );
  const iosFullPath = path.join(repoRoot, 'apps/ios/HarnessTests/GateAFullScreenSnapshotTests.swift');
  const androidFull = fs.readFileSync(androidFullPath, 'utf8');
  const iosFull = fs.readFileSync(iosFullPath, 'utf8');
  if (!androidFull.includes('stock-market-review.json') || !iosFull.includes('stock-market-review.json')) {
    fail('stock-market-review.json must be in Android/iOS GateAFullScreenSnapshot tests');
  }
}

const tokensPathGateA = path.join(contractRoot, 'design-tokens.json');
if (fs.existsSync(tokensPathGateA)) {
  const snaps = JSON.parse(fs.readFileSync(tokensPathGateA, 'utf8')).layout?.workbenchSheetSnapPoints ?? [];
  const norm = snaps.map((s) => `${s}`.replace(/\s/g, '').toLowerCase()).join(',');
  if (norm !== '44%,72%,98%') {
    fail('design-tokens.json workbenchSheetSnapPoints must be ["44%","72%","98%"]');
  } else {
    ok('design-tokens workbenchSheetSnapPoints 44/72/98%');
  }
}
const detentTriple = [
  ['apps/android/app/src/main/kotlin/com/harness/agent/ui/workbench/WorkbenchSheetOverlay.kt', /0\.44f[\s\S]*0\.72f[\s\S]*0\.98f/],
  ['apps/ios/Harness/Preview/WorkbenchSheetView.swift', /0\.44[\s\S]*0\.72[\s\S]*0\.98/],
  ['apps/harmony/entry/src/main/ets/preview/PreviewWorkbenchSheet.ets', /'44%'[\s\S]*'72%'[\s\S]*'98%'/],
];
for (const [rel, re] of detentTriple) {
  const p = path.join(repoRoot, rel);
  if (!fs.existsSync(p) || !re.test(fs.readFileSync(p, 'utf8'))) {
    fail(`${rel} detents must match design-tokens 44/72/98%`);
  }
}
ok('Workbench detents align with design-tokens on Android/iOS/Harmony');

const wbLabelPaths = [
  'apps/android/app/src/main/kotlin/com/harness/agent/ui/workbench/WorkbenchTabLabels.kt',
  'apps/ios/Harness/Preview/WorkbenchSheetView.swift',
  'apps/harmony/entry/src/main/ets/preview/WorkbenchSegmentedTabs.ets',
];
for (const rel of wbLabelPaths) {
  const t = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
  if (!t.includes('实时跟随')) {
    fail(`${rel} Workbench activity tab must label 实时跟随 (RN/Web parity)`);
  }
}
if (!fs.readFileSync(path.join(repoRoot, 'apps/android/core-ui/src/main/kotlin/com/harness/agent/coreui/primitives/HarnessSegmentedControl.kt'), 'utf8').includes('colors.primary')) {
  fail('HarnessSegmentedControl must use primary selected segment (RN segmentTabSelected)');
}
ok('Workbench tab labels + segmented control align with RN VIA');

for (const rel of [
  'apps/android/app/src/main/kotlin/com/harness/agent/ui/chat/ChatTopBar.kt',
  'apps/ios/Harness/Preview/ChatTopBarView.swift',
  'apps/harmony/entry/src/main/ets/preview/ChatTopBar.ets',
]) {
  const t = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
  if (/场景/.test(t)) {
    fail(`${rel} must not expose Dev Menu「场景」in chat top bar (RN parity)`);
  }
}
ok('Chat top bar matches RN (no in-bar Dev Menu chip)');

const harmonyPagesJson = path.join(repoRoot, 'apps/harmony/entry/src/main/resources/base/profile/main_pages.json');
if (fs.existsSync(harmonyPagesJson)) {
  const pages = fs.readFileSync(harmonyPagesJson, 'utf8');
  for (const page of [
    'PreviewMenuPage',
    'PreviewChatPage',
    'PreviewSettingsPage',
    'PreviewMcpPage',
    'PreviewMemoryPage',
    'PreviewReaderPage',
  ]) {
    if (!pages.includes(page)) {
      fail(`main_pages.json missing ${page}`);
    }
  }
  ok('Harmony main_pages.json registers Preview routes');
}

const lockfile = path.join(repoRoot, 'pnpm-lock.yaml');
if (fs.existsSync(lockfile)) {
  const lockText = fs.readFileSync(lockfile, 'utf8');
  if (!/packages\/mobile-contract/.test(lockText)) {
    fail('pnpm-lock.yaml must include packages/mobile-contract (run pnpm install at repo root)');
  } else {
    ok('pnpm-lock.yaml includes mobile-contract workspace (CI frozen-lockfile)');
  }
}

for (const rel of [
  'apps/android/scripts/run-gate-a-long-thread-benchmark.sh',
  'apps/android/scripts/launch-preview.sh',
  'apps/ios/scripts/run-gate-a-long-thread-scroll.sh',
  'apps/ios/scripts/launch-preview.sh',
]) {
  if (!fs.existsSync(path.join(repoRoot, rel))) {
    fail(`Missing Gate A §8.2 script: ${rel}`);
  }
}
const macroGradle = path.join(repoRoot, 'apps/android/macrobenchmark/build.gradle.kts');
if (fs.existsSync(macroGradle)) {
  const macroText = fs.readFileSync(macroGradle, 'utf8');
  if (!/kotlin\.android/.test(macroText)) {
    fail('macrobenchmark module must apply kotlin-android (Macrobenchmark tests compile)');
  }
}
if (!fs.existsSync(path.join(repoRoot, 'apps/ios/Harness/Preview/GateAScrollPerformanceMonitor.swift'))) {
  fail('Missing GateAScrollPerformanceMonitor.swift for iOS §8.2 scroll perf');
}
ok('Gate A §8.2 benchmark wiring (Android Macrobenchmark + iOS scroll perf)');

const devMenuFixtureTag = [
  ['apps/android/app/src/main/kotlin/com/harness/agent/ui/PreviewScreens.kt', /dev-menu-fixture-\$\{item\.fileName\}/],
  ['apps/ios/Harness/Preview/PreviewDevMenuView.swift', /dev-menu-fixture-/],
  ['apps/harmony/entry/src/main/ets/pages/PreviewMenuPage.ets', /dev-menu-fixture-\$\{item\.fileName\}/],
];
for (const [rel, re] of devMenuFixtureTag) {
  const p = path.join(repoRoot, rel);
  if (!fs.existsSync(p) || !re.test(fs.readFileSync(p, 'utf8'))) {
    fail(`${rel} must tag Dev Menu fixture rows (signoff / UI test)`);
  }
}
ok('Dev Menu fixture rows tagged (dev-menu-fixture-<fileName>) on three platforms');

if (failed) {
  process.exit(1);
}
console.log('Gate A invariants passed.');
