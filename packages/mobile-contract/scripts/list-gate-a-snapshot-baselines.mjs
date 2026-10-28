#!/usr/bin/env node
/**
 * 列出 Gate A 静态 verifier 要求入库的双端 Snapshot PNG（便于 git add）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const BASELINES = [
  'apps/android/app/src/test/snapshots/images/com.harness.agent.snapshot_GateAWorkbenchDetentSnapshotTest_workbenchLowDetent_exposesComposer_workbench-low-detent-44pct.png',
  'apps/ios/HarnessTests/__Snapshots__/GateAWorkbenchDetentSnapshotTests/testWorkbenchLowDetentExposesComposer.workbench-low-detent-44pct.png',
  'apps/android/app/src/test/snapshots/images/com.harness.agent.snapshot_GateAFixtureSnapshotTest_workbenchReportMarkdown_artifactTab.png',
  'apps/android/app/src/test/snapshots/images/com.harness.agent.snapshot_GateAFixtureSnapshotTest_workbenchReportMarkdown_contextTab.png',
  'apps/ios/HarnessTests/__Snapshots__/GateAFixtureSnapshotTests/testWorkbenchReportMarkdownArtifactTab.1.png',
  'apps/ios/HarnessTests/__Snapshots__/GateAFixtureSnapshotTests/testWorkbenchReportMarkdownContextTab.1.png',
  'apps/android/app/src/test/snapshots/images/com.harness.agent.snapshot_GateAFixtureSnapshotTest_workbenchSources_passageHalfSheet.png',
  'apps/ios/HarnessTests/__Snapshots__/GateAFixtureSnapshotTests/testWorkbenchSourcesPassageHalfSheet.1.png',
  'apps/android/app/src/test/snapshots/images/com.harness.agent.snapshot_GateAFixtureSnapshotTest_workbenchReportMarkdown_artifactRestoreConfirm.png',
  'apps/ios/HarnessTests/__Snapshots__/GateAFixtureSnapshotTests/testWorkbenchReportMarkdownArtifactRestoreConfirm.1.png',
  'apps/android/app/src/test/snapshots/images/com.harness.agent.snapshot_GateAReaderSnapshotTest_reportReader_workbenchReportMarkdown_report-reader.png',
  'apps/android/app/src/test/snapshots/images/com.harness.agent.snapshot_GateAReaderSnapshotTest_artifactReader_diffPreview_artifact-reader.png',
  'apps/ios/HarnessTests/__Snapshots__/GateAFixtureSnapshotTests/testReportReaderFullScreen.1.png',
  'apps/ios/HarnessTests/__Snapshots__/GateAFixtureSnapshotTests/testArtifactReaderFullScreen.1.png',
  'apps/android/app/src/test/snapshots/images/com.harness.agent.snapshot_GateASettingsSnapshotTest_settingsRoot_default.png',
  'apps/android/app/src/test/snapshots/images/com.harness.agent.snapshot_GateASettingsSnapshotTest_mcpList_withSeedServer.png',
  'apps/android/app/src/test/snapshots/images/com.harness.agent.snapshot_GateASettingsSnapshotTest_memoryHub_defaultEntries.png',
  'apps/ios/HarnessTests/__Snapshots__/GateASnapshotTests/testSettingsRootDefault.1.png',
  'apps/ios/HarnessTests/__Snapshots__/GateASnapshotTests/testMcpListWithSeedServer.1.png',
  'apps/ios/HarnessTests/__Snapshots__/GateASnapshotTests/testMemoryHubDefault.1.png',
];

let missing = 0;
for (const rel of BASELINES) {
  const abs = path.join(repoRoot, rel);
  if (fs.existsSync(abs)) {
    console.log(`OK  ${rel}`);
  } else {
    console.log(`MISS ${rel}`);
    missing += 1;
  }
}
console.log(`\nGate A keyed snapshot baselines: ${BASELINES.length - missing}/${BASELINES.length} present`);

function countPng(dir) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  function walk(d) {
    for (const name of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, name.name);
      if (name.isDirectory()) walk(p);
      else if (name.name.endsWith('.png')) n += 1;
    }
  }
  walk(dir);
  return n;
}

const androidSnapDir = path.join(repoRoot, 'apps/android/app/src/test/snapshots');
const iosSnapDir = path.join(repoRoot, 'apps/ios/HarnessTests/__Snapshots__');
const androidPng = countPng(androidSnapDir);
const iosPng = countPng(iosSnapDir);
console.log(
  `All snapshot PNG on disk: Android ${androidPng} under apps/android/app/src/test/snapshots/, iOS ${iosPng} under HarnessTests/__Snapshots__/`,
);
console.log('Commit 时建议一并 add 上述目录与 apps/*、packages/mobile-contract、docs/native-mobile-gate-a-*');
process.exit(missing ? 1 : 0);
