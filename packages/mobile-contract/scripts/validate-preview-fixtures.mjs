import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = join(root, 'fixtures/preview');
const required = [
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

const present = new Set(readdirSync(fixturesDir).filter((f) => f.endsWith('.json')));
const missing = required.filter((f) => !present.has(f));
if (missing.length) {
  console.error('Missing preview fixtures:', missing.join(', '));
  process.exit(1);
}

for (const name of required) {
  const raw = readFileSync(join(fixturesDir, name), 'utf8');
  const data = JSON.parse(raw);
  if (data.schemaVersion !== 1) {
    console.error(`${name}: schemaVersion must be 1`);
    process.exit(1);
  }
  if (!data.scenarioId) {
    console.error(`${name}: scenarioId required`);
    process.exit(1);
  }
}

const longThread = JSON.parse(readFileSync(join(fixturesDir, 'long-thread-scroll.json'), 'utf8'));
const turnCount = Array.isArray(longThread.conversation) ? longThread.conversation.length : 0;
if (turnCount < 40) {
  console.error(`long-thread-scroll.json: expected >= 40 conversation items for Gate A scroll stress, got ${turnCount}`);
  process.exit(1);
}

console.log(`OK: ${required.length} preview fixtures present.`);
