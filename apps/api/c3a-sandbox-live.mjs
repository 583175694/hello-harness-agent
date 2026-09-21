import { readFileSync } from 'node:fs';
import { Sandbox } from '@alibaba-group/opensandbox';

for (const line of readFileSync('/Users/sz-0203017616/code/other/hello-harness-agent/.env', 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq < 0) continue;
  process.env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
}

const image = process.env.SANDBOX_IMAGE;
const domain = process.env.SANDBOX_DOMAIN;
const apiKey = process.env.SANDBOX_API_KEY;
if (!image || !domain || !apiKey) throw new Error('missing sandbox env');

const report = { echo: null, nonzero: null, collect: null, kill: null };
let sandbox;
try {
  sandbox = await Sandbox.create({
    connectionConfig: { domain, apiKey, protocol: 'http', useServerProxy: true },
    image,
    timeoutSeconds: 180,
    networkPolicy: { defaultAction: 'deny', egress: [] },
    metadata: { purpose: 'c3a-live' },
  });
  await sandbox.files.createDirectories([{ path: '/workspace' }]).catch(() => undefined);

  const echo = await sandbox.commands.run('bash -c "echo C3A-OK"', {
    workingDirectory: '/workspace',
    timeoutSeconds: 15,
  });
  const echoText = (echo.logs.stdout ?? []).map((m) => m.text).join('');
  report.echo = { exitCode: echo.exitCode, stdout: echoText.trim() };
  if (echo.exitCode !== 0 || !echoText.includes('C3A-OK')) throw new Error(`echo failed: ${JSON.stringify(report.echo)}`);

  const fail = await sandbox.commands.run('bash -c "exit 7"', {
    workingDirectory: '/workspace',
    timeoutSeconds: 15,
  });
  report.nonzero = { exitCode: fail.exitCode };
  if (fail.exitCode !== 7) throw new Error(`nonzero failed: ${JSON.stringify(report.nonzero)}`);

  await sandbox.files.writeFiles([{ path: '/workspace/out.txt', data: 'collected-ok\n' }]);
  const written = await sandbox.commands.run('bash -c "printf collected-ok > /workspace/out.txt"', {
    workingDirectory: '/workspace',
    timeoutSeconds: 15,
  });
  const bytes = await sandbox.files.readBytes('/workspace/out.txt');
  const info = await sandbox.files.getFileInfo(['/workspace/out.txt']);
  report.collect = {
    writeExit: written.exitCode,
    text: Buffer.from(bytes).toString('utf8').trim(),
    kind: info['/workspace/out.txt']?.type,
  };
  if (!report.collect.text.includes('collected-ok')) throw new Error(`collect failed: ${JSON.stringify(report.collect)}`);

  await sandbox.kill();
  report.kill = 'ok';
  sandbox = undefined;
  console.log(JSON.stringify({ ok: true, report }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, report, error: String(error?.message ?? error) }, null, 2));
  process.exitCode = 1;
} finally {
  if (sandbox) await sandbox.kill().catch(() => undefined);
}
