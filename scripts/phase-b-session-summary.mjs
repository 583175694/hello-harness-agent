#!/usr/bin/env node
/**
 * 联调 Snapshot 对拍辅助：打印与 Web /agent 可比对的 Session 摘要。
 * 用法：HARNESS_SESSION_COOKIE='harness_session=…' node scripts/phase-b-session-summary.mjs <sessionId>
 */
const base = (process.env.HARNESS_API_BASE ?? 'http://127.0.0.1:4318').replace(/\/$/, '');
const sessionId = process.argv[2];
const cookie = process.env.HARNESS_SESSION_COOKIE;

if (!sessionId) {
  console.error('Usage: HARNESS_SESSION_COOKIE=... node scripts/phase-b-session-summary.mjs <sessionId>');
  process.exit(1);
}
if (!cookie) {
  console.error('Missing HARNESS_SESSION_COOKIE');
  process.exit(1);
}

const url = `${base}/api/agent/sessions/${encodeURIComponent(sessionId)}?limit=100`;
const res = await fetch(url, { headers: { Cookie: cookie } });
if (!res.ok) {
  console.error(`HTTP ${res.status} ${url}`);
  process.exit(1);
}
const body = await res.json();
const session = body.session ?? body;
const messages = session.messages ?? [];
const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
const summary = {
  sessionId: session.id,
  title: session.title,
  messageCount: messages.length,
  activeRun: session.activeRun ?? null,
  pendingUserInputs: (session.pendingUserInputs ?? []).length,
  artifactSeriesCount: (session.artifactSeries ?? []).length,
  artifactVersionCount: (session.artifactSeries ?? []).reduce(
    (sum, s) => sum + (s.versions?.length ?? 0),
    0,
  ),
  lastAssistantRunId: lastAssistant?.runId ?? null,
  lastAssistantDelivery: lastAssistant?.deliveryStatus ?? null,
};
console.log(JSON.stringify(summary, null, 2));
