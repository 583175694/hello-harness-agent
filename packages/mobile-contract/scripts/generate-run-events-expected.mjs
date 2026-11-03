#!/usr/bin/env node
/**
 * Replay mobile-contract run-events fixtures through TS applyRunEventToSession + presentAssistantBlocks.
 * Requires built workspace packages: pnpm --filter @harness/agent-run-state build && pnpm --filter @harness/agent-conversation build
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const contractRoot = resolve(scriptDir, '..');
const repoRoot = resolve(contractRoot, '../..');

async function loadModule(relative) {
  const path = join(repoRoot, relative);
  return import(pathToFileURL(path).href);
}

const { applyRunEventToSession } = await loadModule('packages/agent-run-state/dist/index.js');
const { presentAssistantBlocks } = await loadModule('packages/agent-conversation/dist/index.js');

const emptyWorkbench = {
  runId: '',
  title: '',
  subtitle: '',
  activeView: 'tool_results',
  activityStatus: 'running',
  executions: [],
  sources: [],
  followMode: 'auto',
  open: false,
};

const deps = {
  toConversationItem: () => ({ id: 'asst-1', kind: 'assistant', blocks: [] }),
  preferRicherAssistant: (_current, restored) => restored,
  mergePendingSteerState: (conversation) => conversation,
  uniquePendingInputs: (items) => items,
  mergeWorkbenchDeliverables: (workbench) => workbench,
  applyToolEvent: (current) => current ?? emptyWorkbench,
  resolveWorkbenchOpenOnToolEvent: () => false,
  collectedArtifactFromCommandResult: () => undefined,
  canonicalUrl: (url) => url,
};

function mapProcess(process) {
  return process.map((entry) => {
    if (entry.kind === 'reasoning') {
      return {
        kind: 'reasoning',
        content: entry.block.content,
        streaming: !entry.block.completedAt,
        durationMs: entry.block.durationMs ?? null,
      };
    }
    if (entry.kind === 'tool') {
      const block = entry.block;
      return {
        kind: 'tool',
        id: block.toolCallId,
        name: block.title || block.toolName,
        status: block.status,
        summary: block.summary ?? '',
      };
    }
    return { kind: 'text', content: entry.block.content };
  });
}

function presentationExpected(sessionState, assistantMessageId) {
  const item = sessionState.conversation.find(
    (entry) => entry.kind === 'assistant' && entry.id === assistantMessageId,
  );
  if (!item || item.kind !== 'assistant') {
    throw new Error('assistant item missing');
  }
  const presentation = presentAssistantBlocks(item.blocks);
  return {
    pending: Boolean(item.pending),
    deliveryStatus: item.deliveryStatus ?? 'streaming',
    pendingText: presentation.pendingText,
    finalText: presentation.finalText,
    process: mapProcess(presentation.process),
  };
}

function replayFixture(fixture) {
  const assistantMessageId = fixture.assistantMessageId;
  let sessionState = {
    label: 'Golden',
    subtitle: '',
    conversation: [
      {
        id: assistantMessageId,
        kind: 'assistant',
        blocks: [],
        pending: true,
        deliveryStatus: 'streaming',
      },
    ],
  };
  let cursor = fixture.initialCursor ?? 0;
  let pendingInputs = [];
  let sessionPending = true;

  for (const raw of fixture.events) {
    const event = {
      type: raw.type,
      runId: raw.runId ?? fixture.runId,
      seq: raw.seq,
      payload: raw.payload,
    };
    const result = applyRunEventToSession(
      fixture.sessionId,
      sessionState,
      pendingInputs,
      sessionPending,
      event,
      cursor,
      '',
      deps,
    );
    if (result.duplicate || result.gap) {
      throw new Error(`fixture stuck at seq ${raw.seq}: duplicate=${result.duplicate} gap=${result.gap}`);
    }
    sessionState = result.sessionState;
    pendingInputs = result.pendingInputs;
    sessionPending = result.sessionPending;
    cursor = result.nextCursor;
  }

  return presentationExpected(sessionState, assistantMessageId);
}

const fixturesDir = join(contractRoot, 'fixtures/run-events');
const expectedDir = join(fixturesDir, 'expected');
mkdirSync(expectedDir, { recursive: true });

const scenarioFiles = readdirSync(fixturesDir).filter(
  (name) => name.startsWith('s') && name.endsWith('.json'),
);

for (const file of scenarioFiles) {
  const fixture = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
  if (!fixture.events) continue;
  const id = file.replace(/\.json$/u, '').replace(/^s(\d+)-.*/u, 's$1');
  const outName = `${id}.json`;
  const expected = replayFixture(fixture);
  writeFileSync(join(expectedDir, outName), `${JSON.stringify(expected, null, 2)}\n`);
  console.log(`wrote expected/${outName}`);
}
