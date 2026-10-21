const base = process.env.HARNESS_SMOKE_URL || 'http://127.0.0.1:4317';
async function request(route, body) {
  const response = await fetch(base + route, body ? {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  } : undefined);
  if (!response.ok) throw new Error(`${route}: ${response.status} ${await response.text()}`);
  return response.json();
}
async function main() {
  const { session } = await request('/api/agent/sessions', { title: 'Deployment smoke test' });
  const created = await request(`/api/agent/sessions/${session.id}/runs`, {
    content: '请只回复 DEPLOY_OK，不调用工具。', model: 'deepseek-flash',
    reasoningEffort: 'off', idempotencyKey: crypto.randomUUID(),
  });
  console.log(JSON.stringify({ sessionId: session.id, created }));
  const runId = created.run?.id || created.runId;
  if (!runId) throw new Error('Missing run ID');
  for (let i = 0; i < 60; i++) {
    const snapshot = await request(`/api/agent/runs/${runId}`);
    const run = snapshot.run || snapshot;
    if (['completed', 'failed', 'cancelled'].includes(run.status)) {
      console.log(JSON.stringify({ status: run.status, assistantContent: snapshot.assistantContent }));
      if (run.status !== 'completed') process.exitCode = 1;
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Run did not complete in 60 seconds');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
