#!/usr/bin/env node
/**
 * Gate A keyed snapshot PNG（仅 iOS 入库；Android Paparazzi 见 .gitignore）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const BASELINES = [
  'apps/ios/HarnessTests/__Snapshots__/GateAWorkbenchDetentSnapshotTests/testWorkbenchLowDetentExposesComposer.workbench-low-detent-44pct.png',
  'apps/ios/HarnessTests/__Snapshots__/GateAFixtureSnapshotTests/testWorkbenchReportMarkdownArtifactTab.1.png',
  'apps/ios/HarnessTests/__Snapshots__/GateAFixtureSnapshotTests/testWorkbenchReportMarkdownContextTab.1.png',
  'apps/ios/HarnessTests/__Snapshots__/GateAFixtureSnapshotTests/testWorkbenchSourcesPassageHalfSheet.1.png',
  'apps/ios/HarnessTests/__Snapshots__/GateAFixtureSnapshotTests/testWorkbenchReportMarkdownArtifactRestoreConfirm.1.png',
  'apps/ios/HarnessTests/__Snapshots__/GateAFixtureSnapshotTests/testReportReaderFullScreen.1.png',
  'apps/ios/HarnessTests/__Snapshots__/GateAFixtureSnapshotTests/testArtifactReaderFullScreen.1.png',
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
console.log(`\nGate A keyed snapshot baselines (iOS): ${BASELINES.length - missing}/${BASELINES.length} present`);

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

const iosSnapDir = path.join(repoRoot, 'apps/ios/HarnessTests/__Snapshots__');
const iosPng = countPng(iosSnapDir);
console.log(`iOS snapshot PNG on disk: ${iosPng} under HarnessTests/__Snapshots__/`);
console.log('Android Paparazzi: 本地 optional，apps/android/app/src/test/snapshots/ 已 gitignore');
process.exit(missing ? 1 : 0);
