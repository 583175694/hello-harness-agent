#!/usr/bin/env node
/**
 * Run Snapshot 对拍辅助（与 Web SSE 终态 / GET run 对照）。
 * 用法：HARNESS_SESSION_COOKIE='…' node scripts/phase-b-run-summary.mjs <runId>
 */
const base = (process.env.HARNESS_API_BASE ?? 'http://127.0.0.1:4318').replace(/\/$/, '');
const runId = process.argv[2];
const cookie = process.env.HARNESS_SESSION_COOKIE;

if (!runId) {
  console.error('Usage: HARNESS_SESSION_COOKIE=... node scripts/phase-b-run-summary.mjs <runId>');
  process.exit(1);
}
if (!cookie) {
  console.error('Missing HARNESS_SESSION_COOKIE');
  process.exit(1);
}

const headers = { Cookie: cookie };
const snapUrl = `${base}/api/agent/runs/${encodeURIComponent(runId)}`;
const snapRes = await fetch(snapUrl, { headers });
if (!snapRes.ok) {
  console.error(`HTTP ${snapRes.status} GET ${snapUrl}`);
  process.exit(1);
}
const snapshot = await snapRes.json();

let detailSummary = null;
try {
  const detailUrl = `${base}/api/agent/runs/${encodeURIComponent(runId)}/detail`;
  const detailRes = await fetch(detailUrl, { headers });
  if (detailRes.ok) {
    const detail = await detailRes.json();
    detailSummary = {
      executionCount: detail.executions?.length ?? 0,
      sourceCount: detail.sources?.length ?? 0,
      blockCount: detail.blocks?.length ?? 0,
    };
  }
} catch {
  // detail 可选
}

const summary = {
  runId: snapshot.runId ?? runId,
  sessionId: snapshot.sessionId ?? null,
  status: snapshot.status ?? null,
  messageId: snapshot.messageId ?? null,
  lastEventSequence: snapshot.lastEventSequence ?? snapshot.lastSequence ?? null,
  detail: detailSummary,
};
console.log(JSON.stringify(summary, null, 2));
